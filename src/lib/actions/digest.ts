"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DigestPayload, NodeType } from "@/types/database";
import {
  selectCandidateNodes,
  buildBreadcrumb,
  generateDigestAnalysis,
  type CandidateNodeRef,
} from "@/lib/digest-utils";
import { getOrCreateInboxNode } from "@/lib/actions/knowledge";

type ApprovedUpdate =
  | { type: "node_update"; nodeId: string; takeaways: string[] }
  | { type: "new_node"; temp_id: string; title: string; parentId: string; nodeType: NodeType };

export type DigestHistoryItem = {
  id: string;
  date: string;
  summary: string | null;
  suggestion_status: string | null;
};

async function getDigestText(payload: { kind: "text"; text: string } | { kind: "voice"; formData: FormData }): Promise<{ text: string } | { error: string }> {
  if (payload.kind === "text") return { text: payload.text };
  const file = payload.formData.get("file") as File | null;
  if (!file) return { error: "No voice memo provided." };
  if (file.size > 25 * 1024 * 1024) return { error: "Audio file is too large (max 25MB)." };
  try {
    const { getOpenAIClient } = await import("@/lib/knowledge-utils");
    const openai = getOpenAIClient();
    if (!openai) return { error: "AI client not configured." };
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "en",
    });
    if (!response.text || response.text.trim().length < 10) {
      return { error: "Could not transcribe any words from this audio file." };
    }
    return { text: response.text };
  } catch (err: unknown) {
    console.error("Voice transcription error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return { error: "Failed to transcribe audio file. " + errMsg };
  }
}

export async function analyzeDigest(
  payload: { kind: "text"; text: string } | { kind: "voice"; formData: FormData },
  date: string
): Promise<
  | { digestId: string; payload: DigestPayload; nodeTitles: Record<string, string> }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const textResult = await getDigestText(payload);
  if ("error" in textResult) return { error: textResult.error };
  const rawText = textResult.text;

  // Upsert daily_digests row
  const { data: digest, error: upsertError } = await supabase
    .from("daily_digests")
    .upsert(
      { user_id: user.id, date, raw_text: rawText, summary: null },
      { onConflict: "user_id,date" }
    )
    .select("id")
    .single();

  if (upsertError || !digest) {
    return { error: upsertError?.message ?? "Failed to save digest" };
  }

  // Fetch candidate node columns (no updated_at)
  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, title, parent_id, depth, mastery_status, node_type")
    .eq("user_id", user.id);

  type NodeRow = {
    id: string;
    title: string;
    parent_id: string | null;
    depth: number;
    mastery_status: string;
    node_type: string;
  };

  const nodes: NodeRow[] = (allNodes ?? []) as NodeRow[];
  const nodeSimple = nodes.map((n) => ({ id: n.id, title: n.title, parent_id: n.parent_id }));
  const nodeTitles: Record<string, string> = Object.fromEntries(nodes.map((n) => [n.id, n.title]));

  // Get or create Inbox node
  const inboxNodeId = await getOrCreateInboxNode(user.id, supabase);

  // Select candidate nodes and build refs
  const candidates = selectCandidateNodes(nodes, rawText);
  const candidateRefs: CandidateNodeRef[] = candidates.map((n) => ({
    id: n.id,
    title: n.title,
    breadcrumb: buildBreadcrumb(n.id, nodeSimple),
    node_type: n.node_type,
  }));

  // Generate AI analysis
  const analysisPayload = await generateDigestAnalysis(rawText, candidateRefs, inboxNodeId);
  if (!analysisPayload) return { error: "AI analysis failed" };

  // Delete existing pending suggestions for this digest (idempotency)
  await supabase
    .from("digest_suggestions")
    .delete()
    .eq("digest_id", digest.id)
    .eq("status", "pending");

  // Insert new suggestion row
  const { error: insertError } = await supabase.from("digest_suggestions").insert({
    digest_id: digest.id,
    user_id: user.id,
    status: "pending",
    payload_json: analysisPayload,
  });

  if (insertError) return { error: insertError.message };

  // Update digest summary
  await supabase
    .from("daily_digests")
    .update({ summary: analysisPayload.summary })
    .eq("id", digest.id);

  return { digestId: digest.id, payload: analysisPayload, nodeTitles };
}

export async function saveDigestOnly(
  payload: { kind: "text"; text: string } | { kind: "voice"; formData: FormData },
  date: string
): Promise<{ error: string } | void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const textResult = await getDigestText(payload);
  if ("error" in textResult) return { error: textResult.error };
  const rawText = textResult.text;

  const { error } = await supabase
    .from("daily_digests")
    .upsert(
      { user_id: user.id, date, raw_text: rawText, summary: null },
      { onConflict: "user_id,date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/learn/digest");
}

export async function applyDigestUpdates(
  digestId: string,
  approvedUpdates: ApprovedUpdate[]
): Promise<{ error: string } | void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify digest belongs to user
  const { data: digest } = await supabase
    .from("daily_digests")
    .select("id")
    .eq("id", digestId)
    .eq("user_id", user.id)
    .single();

  if (!digest) return { error: "Digest not found" };

  const nodeUpdates = approvedUpdates.filter(
    (u): u is Extract<ApprovedUpdate, { type: "node_update" }> => u.type === "node_update"
  );
  const newNodes = approvedUpdates.filter(
    (u): u is Extract<ApprovedUpdate, { type: "new_node" }> => u.type === "new_node"
  );

  // Batch node updates: fetch current user_facts then merge
  if (nodeUpdates.length > 0) {
    const nodeIds = nodeUpdates.map((u) => u.nodeId);
    const { data: existingNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, user_facts")
      .in("id", nodeIds)
      .eq("user_id", user.id);

    const factsById = new Map<string, string[]>(
      (existingNodes ?? []).map((n) => [n.id, (n.user_facts as string[]) ?? []])
    );

    await Promise.all(
      nodeUpdates.map((u) => {
        const existing = factsById.get(u.nodeId) ?? [];
        const existingLower = new Set(existing.map((f) => f.toLowerCase()));
        const merged = [
          ...existing,
          ...u.takeaways.filter((t) => !existingLower.has(t.toLowerCase())),
        ];
        return supabase
          .from("knowledge_nodes")
          .update({ user_facts: merged, updated_at: new Date().toISOString() })
          .eq("id", u.nodeId)
          .eq("user_id", user.id);
      })
    );
  }

  // True batch insert: 2 reads + 1 insert + K parallel type updates
  if (newNodes.length > 0) {
    const parentIds = Array.from(new Set(newNodes.map((n) => n.parentId)));

    // Step 1+2: parent metadata + existing children in parallel
    const [{ data: parents }, { data: existingChildren }] = await Promise.all([
      supabase
        .from("knowledge_nodes")
        .select("id, root_id, depth")
        .in("id", parentIds)
        .eq("user_id", user.id),
      supabase
        .from("knowledge_nodes")
        .select("title, parent_id")
        .in("parent_id", parentIds)
        .eq("user_id", user.id),
    ]);

    const parentMap = new Map((parents ?? []).map((p) => [p.id, p]));
    const existingByParent = new Map<string, Set<string>>();
    for (const c of existingChildren ?? []) {
      if (!existingByParent.has(c.parent_id)) existingByParent.set(c.parent_id, new Set());
      existingByParent.get(c.parent_id)!.add(c.title.toLowerCase());
    }

    // Step 3: build rows, filter duplicates
    const rows = newNodes
      .filter((n) => {
        const parent = parentMap.get(n.parentId);
        if (!parent) return false;
        return !(existingByParent.get(n.parentId) ?? new Set()).has(n.title.toLowerCase());
      })
      .map((n) => ({
        user_id: user.id,
        parent_id: n.parentId,
        root_id: parentMap.get(n.parentId)!.root_id,
        title: n.title,
        position_x: 0,
        position_y: 0,
        depth: parentMap.get(n.parentId)!.depth + 1,
        ai_generated: true,
      }));

    if (rows.length > 0) {
      // Step 4: single batch insert
      const { data: createdNodes } = await supabase
        .from("knowledge_nodes")
        .insert(rows)
        .select("id, parent_id, title");

      // Step 5: parallel type updates for non-default types
      const typeUpdates = (createdNodes ?? []).flatMap((cn) => {
        const original = newNodes.find(
          (n) => n.parentId === cn.parent_id && n.title === cn.title
        );
        if (!original || original.nodeType === "topic") return [];
        return [
          supabase
            .from("knowledge_nodes")
            .update({ node_type: original.nodeType, updated_at: new Date().toISOString() })
            .eq("id", cn.id)
            .eq("user_id", user.id),
        ];
      });

      if (typeUpdates.length > 0) {
        await Promise.all(typeUpdates);
      }
    }
  }

  // Mark suggestion as applied
  await supabase
    .from("digest_suggestions")
    .update({ status: "applied" })
    .eq("digest_id", digestId)
    .eq("user_id", user.id);

  revalidatePath("/learn/digest");
  revalidatePath("/learn/hub");
}

export async function getRecentDigests(): Promise<DigestHistoryItem[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: digests } = await supabase
    .from("daily_digests")
    .select("id, date, summary")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(10);

  if (!digests || digests.length === 0) return [];

  const digestIds = digests.map((d) => d.id);
  const { data: suggestions } = await supabase
    .from("digest_suggestions")
    .select("digest_id, status")
    .in("digest_id", digestIds)
    .eq("user_id", user.id);

  const statusByDigest = new Map<string, string>(
    (suggestions ?? []).map((s) => [s.digest_id, s.status])
  );

  return digests.map((d) => ({
    id: d.id,
    date: d.date,
    summary: d.summary ?? null,
    suggestion_status: statusByDigest.get(d.id) ?? null,
  }));
}
