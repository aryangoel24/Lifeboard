"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateSubtopics,
  generateGapAnalysis,
  generateSynthesis,
  pickRootColor,
  buildAncestorChain,
  type GapAnalysis,
  type SynthesisResult,
} from "@/lib/knowledge-utils";
import { SCAFFOLD_TEMPLATES } from "@/lib/scaffold-templates";

export async function suggestSubtopics(
  nodeId: string
): Promise<{ suggestions: string[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: node } = await supabase
    .from("knowledge_nodes")
    .select("id, title, parent_id")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .single();

  if (!node) return { error: "Node not found" };

  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, parent_id, title")
    .eq("user_id", user.id);

  const nodeById = new Map<string, { parent_id: string | null; title: string }>();
  for (const n of allNodes ?? []) {
    nodeById.set(n.id, { parent_id: n.parent_id, title: n.title });
  }

  const ancestorChain = buildAncestorChain(nodeId, nodeById);
  const suggestions = await generateSubtopics(node.title, ancestorChain);
  return { suggestions };
}

export async function findGaps(
  nodeId: string
): Promise<GapAnalysis | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: node } = await supabase
    .from("knowledge_nodes")
    .select("id, title, parent_id, user_notes, user_facts")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .single();

  if (!node) return { error: "Node not found" };

  const [{ data: children }, { data: allNodes }] = await Promise.all([
    supabase
      .from("knowledge_nodes")
      .select("title")
      .eq("parent_id", nodeId)
      .eq("user_id", user.id),
    supabase
      .from("knowledge_nodes")
      .select("id, parent_id, title")
      .eq("user_id", user.id),
  ]);

  const childTitles = (children ?? []).map((c: { title: string }) => c.title);

  const nodeById = new Map<string, { parent_id: string | null; title: string }>();
  for (const n of allNodes ?? []) {
    nodeById.set(n.id, { parent_id: n.parent_id, title: n.title });
  }

  const ancestorChain = buildAncestorChain(nodeId, nodeById);

  const result = await generateGapAnalysis(
    node.title,
    childTitles,
    ancestorChain,
    node.user_notes ?? null,
    (node.user_facts as string[]) ?? []
  );

  if (!result) return { error: "AI generation failed" };

  function dedupeAndCap(items: string[], max: number): string[] {
    const seen = new Set<string>();
    return items
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, max);
  }

  return {
    foundational: dedupeAndCap(result.foundational, 4),
    advanced: dedupeAndCap(result.advanced, 3),
    learning_path: dedupeAndCap(result.learning_path, 5),
  };
}

export async function synthesizeNodes(
  nodeIds: string[]
): Promise<SynthesisResult | { error: string }> {
  if (nodeIds.length < 2 || nodeIds.length > 10) {
    return { error: "Please select 2–10 nodes to synthesize" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: nodes } = await supabase
    .from("knowledge_nodes")
    .select("id, title, description, user_notes, user_facts")
    .in("id", nodeIds)
    .eq("user_id", user.id);

  if (!nodes || nodes.length < 2) return { error: "Nodes not found" };

  const result = await generateSynthesis(
    nodes as {
      title: string;
      description?: string | null;
      user_notes?: string | null;
      user_facts?: string[] | null;
    }[]
  );

  if (!result) return { error: "AI synthesis failed" };
  return result;
}

export async function applyScaffold(
  templateId: string,
  scaffoldId: string
): Promise<void | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const template = SCAFFOLD_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { error: "Template not found" };

  const { count: existingRootCount } = await supabase
    .from("knowledge_nodes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("parent_id", null);

  const rootRows = template.roots.map((root, i) => ({
    user_id: user.id,
    parent_id: null,
    root_id: "00000000-0000-0000-0000-000000000000",
    title: root.title,
    node_type: root.node_type,
    color: pickRootColor((existingRootCount ?? 0) + i),
    position_x: 0,
    position_y: 0,
    depth: 0,
    ai_generated: false,
    source: "scaffold",
    source_ref: scaffoldId,
  }));

  const { data: insertedRoots, error: rootError } = await supabase
    .from("knowledge_nodes")
    .insert(rootRows)
    .select("id, title");

  if (rootError || !insertedRoots) return { error: rootError?.message ?? "Failed to insert roots" };

  await Promise.all(
    insertedRoots.map((r) =>
      supabase.from("knowledge_nodes").update({ root_id: r.id }).eq("id", r.id)
    )
  );

  const childRows: Record<string, unknown>[] = [];
  for (const root of template.roots) {
    const inserted = insertedRoots.find((r) => r.title === root.title);
    if (!inserted) continue;
    for (const child of root.children) {
      childRows.push({
        user_id: user.id,
        parent_id: inserted.id,
        root_id: inserted.id,
        title: child.title,
        node_type: child.node_type,
        position_x: 0,
        position_y: 0,
        depth: 1,
        ai_generated: false,
        source: "scaffold",
        source_ref: scaffoldId,
      });
    }
  }

  if (childRows.length > 0) {
    const { error: childError } = await supabase.from("knowledge_nodes").insert(childRows);
    if (childError) return { error: childError.message };
  }

  revalidatePath("/learn/hub");
}

export async function resetScaffold(
  scaffoldId: string
): Promise<void | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: roots } = await supabase
    .from("knowledge_nodes")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "scaffold")
    .eq("source_ref", scaffoldId)
    .is("parent_id", null);

  if (roots && roots.length > 0) {
    const { error } = await supabase
      .from("knowledge_nodes")
      .delete()
      .in("id", roots.map((r) => r.id))
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/learn/hub");
}
