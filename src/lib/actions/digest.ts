"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DigestPayload, NodeType } from "@/types/database";
import { addChildNodes } from "@/lib/actions/knowledge";
import {
  selectCandidateNodes,
  buildBreadcrumb,
  generateDigestAnalysis,
  type CandidateNodeRef,
} from "@/lib/digest-utils";

type ApprovedUpdate =
  | { type: "node_update"; nodeId: string; takeaways: string[] }
  | { type: "new_node"; temp_id: string; title: string; parentId: string; nodeType: NodeType };

export type DigestHistoryItem = {
  id: string;
  date: string;
  summary: string | null;
  suggestion_status: string | null;
};

async function getOrCreateInboxNode(
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data: existing } = await supabase
    .from("knowledge_nodes")
    .select("id")
    .eq("user_id", userId)
    .eq("title", "Inbox")
    .is("parent_id", null)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted } = await supabase
    .from("knowledge_nodes")
    .insert({
      user_id: userId,
      parent_id: null,
      root_id: "00000000-0000-0000-0000-000000000000",
      title: "Inbox",
      color: "#6b7280",
      position_x: 0,
      position_y: 0,
      depth: 0,
      ai_generated: false,
    })
    .select("id")
    .single();

  if (!inserted) throw new Error("Failed to create Inbox node");

  await supabase
    .from("knowledge_nodes")
    .update({ root_id: inserted.id })
    .eq("id", inserted.id);

  return inserted.id;
}

export async function analyzeDigest(
  rawText: string,
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
  const payload = await generateDigestAnalysis(rawText, candidateRefs, inboxNodeId);
  if (!payload) return { error: "AI analysis failed" };

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
    payload_json: payload,
  });

  if (insertError) return { error: insertError.message };

  // Update digest summary
  await supabase
    .from("daily_digests")
    .update({ summary: payload.summary })
    .eq("id", digest.id);

  return { digestId: digest.id, payload, nodeTitles };
}

export async function saveDigestOnly(
  rawText: string,
  date: string
): Promise<{ error: string } | void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

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

  // Create new nodes (sequential to handle node_type update after creation)
  for (const n of newNodes) {
    const result = await addChildNodes(n.parentId, [n.title], true);
    if ("nodes" in result && result.nodes.length > 0 && n.nodeType !== "topic") {
      const createdId = result.nodes[0].id;
      await supabase
        .from("knowledge_nodes")
        .update({ node_type: n.nodeType, updated_at: new Date().toISOString() })
        .eq("id", createdId)
        .eq("user_id", user.id);
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
