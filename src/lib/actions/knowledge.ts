"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KnowledgeNode, NodeResource } from "@/types/database";
import {
  generateSubtopics,
  generateNodeDetail,
  pickRootColor,
} from "@/lib/knowledge-utils";

const DETAIL_MODEL = "gpt-4o-mini";

export async function getKnowledgeGraph(): Promise<KnowledgeNode[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("knowledge_nodes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data as KnowledgeNode[]) || [];
}

export async function addRootNode(
  title: string
): Promise<{ node: KnowledgeNode } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  // Count existing root nodes to assign next color
  const { count } = await supabase
    .from("knowledge_nodes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("parent_id", null);

  const color = pickRootColor(count ?? 0);

  // Insert with a placeholder root_id; then update root_id = id
  const { data, error } = await supabase
    .from("knowledge_nodes")
    .insert({
      user_id: user.id,
      parent_id: null,
      root_id: "00000000-0000-0000-0000-000000000000", // placeholder
      title: trimmed,
      color,
      position_x: 0,
      position_y: 0,
      depth: 0,
      ai_generated: false,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };

  // Update root_id = own id
  await supabase
    .from("knowledge_nodes")
    .update({ root_id: data.id })
    .eq("id", data.id);

  revalidatePath("/learn/hub");
  return { node: { ...(data as KnowledgeNode), root_id: data.id } };
}

export async function addChildNodes(
  parentId: string,
  titles: string[],
  aiGenerated: boolean
): Promise<{ nodes: KnowledgeNode[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Validate parent belongs to user
  const { data: parent } = await supabase
    .from("knowledge_nodes")
    .select("id, root_id, depth")
    .eq("id", parentId)
    .eq("user_id", user.id)
    .single();

  if (!parent) return { error: "Parent not found" };

  const filtered = titles.map((t) => t.trim()).filter(Boolean);
  if (filtered.length === 0) return { error: "No titles provided" };

  const rows = filtered.map((title) => ({
    user_id: user.id,
    parent_id: parentId,
    root_id: parent.root_id,
    title,
    position_x: 0,
    position_y: 0,
    depth: parent.depth + 1,
    ai_generated: aiGenerated,
  }));

  const { data, error } = await supabase
    .from("knowledge_nodes")
    .insert(rows)
    .select();

  if (error) return { error: error.message };

  revalidatePath("/learn/hub");
  return { nodes: (data as KnowledgeNode[]) || [] };
}

export async function deleteNode(
  nodeId: string
): Promise<{ deleted_ids: string[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify ownership
  const { data: node } = await supabase
    .from("knowledge_nodes")
    .select("id")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .single();

  if (!node) return { error: "Node not found" };

  // Collect all descendants in memory (cascade will handle DB, but we need ids for UI)
  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, parent_id")
    .eq("user_id", user.id);

  const nodeMap = new Map<string, string | null>();
  for (const n of allNodes ?? []) {
    nodeMap.set(n.id, n.parent_id);
  }

  function collectSubtree(id: string): string[] {
    const children = Array.from(nodeMap.entries())
      .filter(([, pid]) => pid === id)
      .map(([cid]) => cid);
    return [id, ...children.flatMap((c) => collectSubtree(c))];
  }

  const deleted_ids = collectSubtree(nodeId);

  const { error } = await supabase
    .from("knowledge_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/learn/hub");
  return { deleted_ids };
}

export async function updateNodePositions(
  updates: { id: string; x: number; y: number }[]
): Promise<{ error: string } | void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (updates.length === 0) return;

  const results = await Promise.all(
    updates.map(({ id, x, y }) =>
      supabase
        .from("knowledge_nodes")
        .update({ position_x: x, position_y: y, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
}

export async function getNodeDetail(nodeId: string): Promise<
  | { summary: string; key_facts: string[] }
  | { generating: true }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: node } = await supabase
    .from("knowledge_nodes")
    .select("id, title, parent_id, description, key_facts, is_generating, detail_model")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .single();

  if (!node) return { error: "Node not found" };

  // Cache hit
  if (node.description && node.detail_model === DETAIL_MODEL) {
    return { summary: node.description, key_facts: node.key_facts as string[] };
  }

  // Try to acquire generation lock
  const { data: lockData } = await supabase
    .from("knowledge_nodes")
    .update({ is_generating: true })
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .eq("is_generating", false)
    .select("id");

  if (!lockData || lockData.length === 0) {
    return { generating: true };
  }

  // Build ancestor chain
  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, parent_id, title")
    .eq("user_id", user.id);

  const nodeById = new Map<string, { parent_id: string | null; title: string }>();
  for (const n of allNodes ?? []) {
    nodeById.set(n.id, { parent_id: n.parent_id, title: n.title });
  }

  const ancestorChain: string[] = [];
  let cur = nodeById.get(nodeId);
  while (cur?.parent_id) {
    const parent = nodeById.get(cur.parent_id);
    if (!parent) break;
    ancestorChain.unshift(parent.title);
    cur = parent;
  }

  const detail = await generateNodeDetail(node.title, ancestorChain);

  if (!detail) {
    await supabase
      .from("knowledge_nodes")
      .update({ is_generating: false })
      .eq("id", nodeId);
    return { error: "AI generation failed" };
  }

  await supabase
    .from("knowledge_nodes")
    .update({
      description: detail.summary,
      key_facts: detail.key_facts,
      is_generating: false,
      last_ai_generated_at: new Date().toISOString(),
      detail_model: DETAIL_MODEL,
    })
    .eq("id", nodeId);

  return { summary: detail.summary, key_facts: detail.key_facts };
}

export async function saveUserNotes(
  nodeId: string,
  notes: string
): Promise<{ user_notes: string | null } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = notes.trim();
  const value = trimmed === "" ? null : trimmed;

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ user_notes: value, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { user_notes: value };
}

export async function saveResources(
  nodeId: string,
  resources: NodeResource[]
): Promise<{ resources: NodeResource[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ resources, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { resources };
}

export async function saveUserFacts(
  nodeId: string,
  facts: string[]
): Promise<{ user_facts: string[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ user_facts: facts, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { user_facts: facts };
}

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

  // Build ancestor chain from all nodes
  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, parent_id, title")
    .eq("user_id", user.id);

  const nodeById = new Map<string, { parent_id: string | null; title: string }>();
  for (const n of allNodes ?? []) {
    nodeById.set(n.id, { parent_id: n.parent_id, title: n.title });
  }

  const ancestorChain: string[] = [];
  let cur = nodeById.get(nodeId);
  while (cur?.parent_id) {
    const parent = nodeById.get(cur.parent_id);
    if (!parent) break;
    ancestorChain.unshift(parent.title);
    cur = parent;
  }

  const suggestions = await generateSubtopics(node.title, ancestorChain);
  return { suggestions };
}
