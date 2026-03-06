"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KnowledgeNode, KnowledgeLink, NodeResource, NodeType, MasteryStatus } from "@/types/database";
import {
  generateSubtopics,
  generateNodeDetail,
  generateGapAnalysis,
  generateSynthesis,
  pickRootColor,
  type GapAnalysis,
  type SynthesisResult,
} from "@/lib/knowledge-utils";
import { generateEmbedding, hashContent } from "@/lib/ai-utils";
import { SCAFFOLD_TEMPLATES } from "@/lib/scaffold-templates";

const DETAIL_MODEL = "gpt-4o-mini";

/**
 * Re-evaluates a node's embedding by hashing its content.
 * Calls OpenAI only if the hash differs from what's stored in the database.
 */
export async function syncNodeEmbedding(nodeId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: node } = await supabase
    .from("knowledge_nodes")
    .select("title, description, key_facts, user_facts, ai_evidence, node_type, parent_id, root_id, embedding_content_hash")
    .eq("id", nodeId)
    .single();

  if (!node) return;

  const payloadString = `Title: ${node.title}
Type: ${node.node_type}
Path: Parent(${node.parent_id || 'Root'}) -> Root(${node.root_id})
Description: ${node.description || "None"}
Key Facts:
${Array.isArray(node.key_facts) ? node.key_facts.slice(0, 10).map((f: any) => "- " + f).join("\n") : "None"}
User Facts:
${Array.isArray(node.user_facts) ? node.user_facts.slice(0, 10).map((f: any) => "- " + f).join("\n") : "None"}
Evidence: ${node.ai_evidence ? node.ai_evidence.substring(0, 500) + '...' : "None"}`;

  const currentHash = hashContent(payloadString);

  // If the content hasn't changed meaningfully, skip the OpenAI call to save cost/latency
  if (currentHash === node.embedding_content_hash) {
    return;
  }

  const { embedding, error } = await generateEmbedding(payloadString);
  if (error || !embedding) {
    console.error("Failed to generate embedding for node", nodeId, error);
    return;
  }

  // Update table with the newly computed hash and array representing the vector
  await supabase
    .from("knowledge_nodes")
    .update({
      embedding: embedding as any,
      embedding_content_hash: currentHash
    })
    .eq("id", nodeId);
}

export async function getOrCreateInboxNode(
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

function buildAncestorChain(
  nodeId: string,
  nodeById: Map<string, { parent_id: string | null; title: string }>
): string[] {
  const chain: string[] = [];
  let cur = nodeById.get(nodeId);
  while (cur?.parent_id) {
    const parent = nodeById.get(cur.parent_id);
    if (!parent) break;
    chain.push(parent.title);
    cur = parent;
  }
  chain.reverse();
  return chain;
}

export async function getKnowledgeGraph(): Promise<{ nodes: KnowledgeNode[]; links: KnowledgeLink[] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { nodes: [], links: [] };

  const [{ data: nodes }, { data: links }] = await Promise.all([
    supabase
      .from("knowledge_nodes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("knowledge_node_links")
      .select("*")
      .eq("user_id", user.id),
  ]);

  return { nodes: (nodes as KnowledgeNode[]) ?? [], links: (links as KnowledgeLink[]) ?? [] };
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

  // Sync embedding in the background
  void syncNodeEmbedding(data.id).catch(console.error);

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

  const trimmedTitles = titles.map((t) => t.trim()).filter(Boolean);
  if (trimmedTitles.length === 0) return { error: "No titles provided" };

  // Dedup against existing children (case-insensitive) to prevent double-inserts
  const { data: existingChildren } = await supabase
    .from("knowledge_nodes")
    .select("title")
    .eq("parent_id", parentId)
    .eq("user_id", user.id);
  const existingTitlesLower = new Set(
    (existingChildren ?? []).map((c: { title: string }) => c.title.toLowerCase())
  );
  const filtered = trimmedTitles.filter((t) => !existingTitlesLower.has(t.toLowerCase()));
  if (filtered.length === 0) return { nodes: [] };

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

  if (data) {
    data.forEach((n) => void syncNodeEmbedding(n.id).catch(console.error));
  }

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

export async function deleteNodes(
  nodeIds: string[]
): Promise<{ deleted_ids: string[] } | { error: string }> {
  if (nodeIds.length === 0) return { deleted_ids: [] };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Fetch all user nodes to build parent map and compute roots/subtrees
  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, parent_id")
    .eq("user_id", user.id);

  const parentMap = new Map<string, string | null>(
    (allNodes ?? []).map((n) => [n.id as string, n.parent_id as string | null])
  );

  // Reduce to top-level roots: keep only nodes whose ancestors are not also in the selected set
  const selectedSet = new Set(nodeIds);

  function isDescendantOfSelected(id: string): boolean {
    let p = parentMap.get(id) ?? null;
    while (p) {
      if (selectedSet.has(p)) return true;
      p = parentMap.get(p) ?? null;
    }
    return false;
  }

  const rootDeletes = nodeIds.filter((id) => !isDescendantOfSelected(id));

  // Practical ownership check: only verify the roots we'll actually delete
  const { data: owned } = await supabase
    .from("knowledge_nodes")
    .select("id")
    .in("id", rootDeletes)
    .eq("user_id", user.id);

  if (!owned || owned.length !== rootDeletes.length) {
    return { error: "One or more nodes not found" };
  }

  // Compute full deleted_ids (subtrees of each root) for UI cleanup
  const childrenOf = new Map<string, string[]>();
  for (const n of allNodes ?? []) {
    if (n.parent_id) {
      if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
      childrenOf.get(n.parent_id)!.push(n.id as string);
    }
  }
  function collectSubtree(id: string): string[] {
    const children = childrenOf.get(id) ?? [];
    return [id, ...children.flatMap(collectSubtree)];
  }
  const deletedSet = new Set(rootDeletes.flatMap(collectSubtree));

  // Delete root nodes — DB CASCADE removes descendants
  const { error } = await supabase
    .from("knowledge_nodes")
    .delete()
    .in("id", rootDeletes)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/learn/hub");
  return { deleted_ids: Array.from(deletedSet) };
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

  const ancestorChain = buildAncestorChain(nodeId, nodeById);

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

  void syncNodeEmbedding(nodeId).catch(console.error);

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

  void syncNodeEmbedding(nodeId).catch(console.error);

  return { user_facts: facts };
}

export async function addKnowledgeLink(
  nodeIdA: string,
  nodeIdB: string
): Promise<{ link: KnowledgeLink } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Enforce canonical order
  const a_id = nodeIdA < nodeIdB ? nodeIdA : nodeIdB;
  const b_id = nodeIdA < nodeIdB ? nodeIdB : nodeIdA;

  const { data, error } = await supabase
    .from("knowledge_node_links")
    .insert({ user_id: user.id, a_id, b_id })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };

  revalidatePath("/learn/hub");
  return { link: data as KnowledgeLink };
}

export async function deleteKnowledgeLink(
  linkId: string
): Promise<Record<string, never> | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_node_links")
    .delete()
    .eq("id", linkId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/learn/hub");
  return {};
}

export async function setNodeCollapsed(
  nodeId: string,
  collapsed: boolean
): Promise<void | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ is_collapsed: collapsed, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
}

export async function updateNodeType(
  nodeId: string,
  nodeType: NodeType
): Promise<{ node_type: NodeType } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ node_type: nodeType, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { node_type: nodeType };
}

export async function updateMastery(
  nodeId: string,
  newStatus: MasteryStatus,
  newConfidence: number | null,
  previousStatus: MasteryStatus
): Promise<{ mastery_status: MasteryStatus; confidence_score: number | null; last_reviewed_at: string | null } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const statusChanged = newStatus !== previousStatus;
  const last_reviewed_at = statusChanged ? new Date().toISOString() : undefined;

  const update: Record<string, unknown> = {
    mastery_status: newStatus,
    confidence_score: newConfidence,
    updated_at: new Date().toISOString(),
  };
  if (statusChanged) {
    update.last_reviewed_at = last_reviewed_at;
  }

  const { data, error } = await supabase
    .from("knowledge_nodes")
    .update(update)
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .select("mastery_status, confidence_score, last_reviewed_at")
    .single();

  if (error || !data) return { error: error?.message ?? "Update failed" };

  return {
    mastery_status: data.mastery_status as MasteryStatus,
    confidence_score: data.confidence_score as number | null,
    last_reviewed_at: data.last_reviewed_at as string | null,
  };
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

export async function updateNodeTitle(
  nodeId: string,
  title: string
): Promise<{ title: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  void syncNodeEmbedding(nodeId).catch(console.error);

  revalidatePath("/learn/hub");
  return { title: trimmed };
}

export async function moveNode(
  nodeId: string,
  newParentId: string | null
): Promise<{ nodes: KnowledgeNode[] } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (newParentId === nodeId) return { error: "Cannot move a node to itself" };

  const { data: allNodes } = await supabase
    .from("knowledge_nodes")
    .select("*")
    .eq("user_id", user.id);

  if (!allNodes) return { error: "Failed to fetch nodes" };

  const nodeMap = new Map<string, KnowledgeNode>();
  for (const n of allNodes) nodeMap.set(n.id, n as KnowledgeNode);

  const targetNode = nodeMap.get(nodeId);
  if (!targetNode) return { error: "Node not found" };

  // Cycle check: walk up from newParentId; if we hit nodeId it's a cycle
  if (newParentId !== null) {
    let cur: string | null = newParentId;
    while (cur !== null) {
      if (cur === nodeId) return { error: "Cannot move a node into its own subtree" };
      const curNode = nodeMap.get(cur);
      cur = curNode?.parent_id ?? null;
    }
    if (!nodeMap.has(newParentId)) return { error: "New parent not found" };
  }

  // Compute new root/depth values
  let newRootId: string;
  let newDepth: number;
  let newColor: string | undefined;

  if (newParentId === null) {
    const rootCount = allNodes.filter((n) => n.parent_id === null && n.id !== nodeId).length;
    newColor = pickRootColor(rootCount);
    newRootId = nodeId;
    newDepth = 0;
  } else {
    const newParentNode = nodeMap.get(newParentId)!;
    newRootId = newParentNode.root_id;
    newDepth = newParentNode.depth + 1;
  }

  const depthDelta = newDepth - targetNode.depth;

  // Collect all descendants
  function collectDescendantIds(id: string): string[] {
    const children = allNodes!.filter((n) => n.parent_id === id).map((n) => n.id);
    return [...children, ...children.flatMap((c) => collectDescendantIds(c))];
  }
  const descendantIds = collectDescendantIds(nodeId);

  // Update moved node
  const movedUpdate: Record<string, unknown> = {
    parent_id: newParentId,
    root_id: newRootId,
    depth: newDepth,
    updated_at: new Date().toISOString(),
  };
  if (newColor !== undefined) movedUpdate.color = newColor;

  const { error: moveError } = await supabase
    .from("knowledge_nodes")
    .update(movedUpdate)
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (moveError) return { error: moveError.message };

  // Cascade descendants
  if (descendantIds.length > 0) {
    await Promise.all(
      descendantIds.map((id) => {
        const desc = nodeMap.get(id)!;
        return supabase
          .from("knowledge_nodes")
          .update({
            root_id: newRootId,
            depth: desc.depth + depthDelta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", user.id);
      })
    );
  }

  // Return all affected nodes with updated values
  const allAffectedIds = [nodeId, ...descendantIds];
  const { data: updatedNodes } = await supabase
    .from("knowledge_nodes")
    .select("*")
    .in("id", allAffectedIds)
    .eq("user_id", user.id);

  revalidatePath("/learn/hub");
  return { nodes: (updatedNodes as KnowledgeNode[]) ?? [] };
}

export async function saveDescription(
  nodeId: string,
  description: string | null
): Promise<{ description: string | null } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("knowledge_nodes")
    .update({
      description,
      detail_model: DETAIL_MODEL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", nodeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { description };
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

  // Count existing root nodes to pick colors
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

  // Fix root_id for each inserted root
  await Promise.all(
    insertedRoots.map((r) =>
      supabase.from("knowledge_nodes").update({ root_id: r.id }).eq("id", r.id)
    )
  );

  // Build child rows
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

  // Get root scaffold nodes (parent_id is null), then delete them (cascade handles children)
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

export async function promoteFactToNode(
  parentId: string,
  factIndex: number,
  factText: string
): Promise<{ node: KnowledgeNode; remainingFacts: string[] } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: parent } = await supabase
    .from("knowledge_nodes")
    .select("id, root_id, depth, user_facts")
    .eq("id", parentId)
    .eq("user_id", user.id)
    .single();

  if (!parent) return { error: "Parent not found" };

  const facts = (parent.user_facts as string[]) || [];
  if (factIndex < 0 || factIndex >= facts.length || facts[factIndex] !== factText) {
    return { error: "Takeaway has changed, please refresh" };
  }

  const newFacts = [...facts];
  newFacts.splice(factIndex, 1);

  let title = "Promoted Concept";
  let evidenceStr = factText;
  const match = factText.match(/^\\[demoted-node\\]\\s*(.*?) —\\s*(.*)$/);
  if (match) {
    title = match[1].trim();
    evidenceStr = match[2].trim();
  } else {
    const words = factText.split(" ").slice(0, 5);
    title = words.join(" ") + (factText.split(" ").length > 5 ? "..." : "");
  }

  const { data: newNode, error: insertError } = await supabase
    .from("knowledge_nodes")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      root_id: parent.root_id,
      title,
      ai_evidence: evidenceStr,
      source: "manual",
      node_type: "concept",
      position_x: 0,
      position_y: 0,
      depth: parent.depth + 1,
      ai_generated: false,
    })
    .select()
    .single();

  if (insertError || !newNode) return { error: insertError?.message ?? "Failed to create node" };

  const { error: updateError } = await supabase
    .from("knowledge_nodes")
    .update({ user_facts: newFacts, updated_at: new Date().toISOString() })
    .eq("id", parentId)
    .eq("user_id", user.id);

  if (updateError) return { error: updateError.message };

  void syncNodeEmbedding(newNode.id).catch(console.error);
  void syncNodeEmbedding(parentId).catch(console.error);

  revalidatePath("/learn/hub");
  return { node: newNode as KnowledgeNode, remainingFacts: newFacts };
}

export async function mergeNodes(
  sourceNodeId: string,
  targetNodeId: string
): Promise<{ success: boolean } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (sourceNodeId === targetNodeId) return { error: "Cannot merge a node into itself" };

  // 1. Fetch source and target
  const { data: source } = await supabase
    .from("knowledge_nodes")
    .select("id, user_facts, ai_evidence, user_notes")
    .eq("id", sourceNodeId)
    .eq("user_id", user.id)
    .single();

  if (!source) return { error: "Source node not found" };

  const { data: target } = await supabase
    .from("knowledge_nodes")
    .select("id, user_facts, ai_evidence, user_notes")
    .eq("id", targetNodeId)
    .eq("user_id", user.id)
    .single();

  if (!target) return { error: "Target node not found" };

  // 2. Compute merged properties
  const targetFacts = (target.user_facts as string[]) || [];
  const sourceFacts = (source.user_facts as string[]) || [];

  // Dedup facts
  const mergedFacts = Array.from(new Set([...targetFacts, ...sourceFacts]));

  const mergedEvidence = [target.ai_evidence, source.ai_evidence].filter(Boolean).join("\n\n---\n\n");
  const mergedNotes = [target.user_notes, source.user_notes].filter(Boolean).join("\n\n---\n\n");

  // 3. Update target node with merged content
  const { error: updateTargetError } = await supabase
    .from("knowledge_nodes")
    .update({
      user_facts: mergedFacts,
      ai_evidence: mergedEvidence || null,
      user_notes: mergedNotes || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", targetNodeId)
    .eq("user_id", user.id);

  if (updateTargetError) return { error: updateTargetError.message };

  void syncNodeEmbedding(targetNodeId).catch(console.error);

  // 4. Reparent children of source to target
  // We just set parent_id = targetNodeId for any child of sourceNodeId
  const { error: reparentError } = await supabase
    .from("knowledge_nodes")
    .update({
      parent_id: targetNodeId,
      updated_at: new Date().toISOString()
    })
    .eq("parent_id", sourceNodeId)
    .eq("user_id", user.id);

  if (reparentError) {
    console.error("Failed to reparent children during merge:", reparentError);
    // Non-fatal, proceed to delete source which cascades any straggler children
  }

  // 5. Transfer cross-links where source was 'a_id' or 'b_id'
  // Fetch existing links involving source
  const { data: sourceLinks } = await supabase
    .from("knowledge_node_links")
    .select("*")
    .or(`a_id.eq.${sourceNodeId},b_id.eq.${sourceNodeId}`)
    .eq("user_id", user.id);

  if (sourceLinks && sourceLinks.length > 0) {
    for (const link of sourceLinks) {
      // Determine the 'other' node in the link
      const otherId = link.a_id === sourceNodeId ? link.b_id : link.a_id;

      // If the link is back to target itself, just delete it (it will be deleted via cascade anyway)
      if (otherId === targetNodeId) continue;

      // Recreate link between targetNodeId and otherId
      const new_a_id = targetNodeId < otherId ? targetNodeId : otherId;
      const new_b_id = targetNodeId < otherId ? otherId : targetNodeId;

      const { error: linkInsertError } = await supabase
        .from("knowledge_node_links")
        .insert({ user_id: user.id, a_id: new_a_id, b_id: new_b_id });

      if (linkInsertError && linkInsertError.code !== '23505') {
        // Ignore unique constraint violations if connection already exists
        console.error("Failed to transfer link during merge:", linkInsertError);
      }
    }
  }

  // 6. Delete source node
  const { error: deleteError } = await supabase
    .from("knowledge_nodes")
    .delete()
    .eq("id", sourceNodeId)
    .eq("user_id", user.id);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/learn/hub");
  return { success: true };
}
