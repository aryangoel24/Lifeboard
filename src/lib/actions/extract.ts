"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateKnowledgeExtraction } from "@/lib/knowledge-utils";
import { getOrCreateInboxNode } from "@/lib/actions/knowledge";
import type { ExtractionResult, NodeType } from "@/types/database";

export type ApprovedExtractionNode = {
  temp_id: string;
  title: string;
  nodeType: NodeType;
  parentTempId: string | null;
  evidence: string;
};

export type ApprovedMatch = {
  matched_node_id: string;
  add_facts: string[];
};

export type RootRouting = Record<string, { mode: "new" } | { mode: "merge"; targetNodeId: string }>;

export async function extractKnowledge(
  text: string
): Promise<
  | { result: ExtractionResult; allNodes: { id: string; title: string; breadcrumb: string }[] }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: dbNodes } = await supabase
    .from("knowledge_nodes")
    .select("id, title, parent_id")
    .eq("user_id", user.id);

  const nodeMap = new Map<string, { title: string; parent_id: string | null }>(
    (dbNodes ?? []).map((n) => [
      n.id as string,
      { title: n.title as string, parent_id: n.parent_id as string | null },
    ])
  );

  function buildBreadcrumb(id: string): string {
    const parts: string[] = [];
    let current: string | null = id;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const node = nodeMap.get(current);
      if (!node) break;
      parts.unshift(node.title);
      current = node.parent_id;
    }
    return parts.join(" → ");
  }

  const allNodes = (dbNodes ?? []).map((n) => ({
    id: n.id as string,
    title: n.title as string,
    breadcrumb: buildBreadcrumb(n.id as string),
  }));

  const result = await generateKnowledgeExtraction(text, allNodes);
  if (!result) return { error: "AI extraction failed" };

  // Post-process: filter out proposed nodes that already exist in the user's graph
  // Only remove a node if it's a duplicate AND has no remaining new children
  const existingTitlesLower = new Set(
    (dbNodes ?? []).map((n) => (n.title as string).toLowerCase())
  );

  function filterExistingNodes(
    nodes: ExtractionResult["roots"]
  ): ExtractionResult["roots"] {
    return nodes
      .map((node) => ({
        ...node,
        children: node.children
          ? filterExistingNodes(node.children)
          : undefined,
      }))
      .filter((node) => {
        const isDuplicate = existingTitlesLower.has(node.title.toLowerCase());
        const hasNewChildren = (node.children ?? []).length > 0;
        // Keep the node if it's not a duplicate, OR if it still has new children
        return !isDuplicate || hasNewChildren;
      });
  }

  result.roots = result.roots.map((root) => ({
    ...root,
    children: root.children
      ? filterExistingNodes(root.children)
      : undefined,
  }));

  return { result, allNodes };
}

export async function applyExtraction(
  extractionId: string,
  approvedNodes: ApprovedExtractionNode[],
  approvedMatches: ApprovedMatch[],
  rootRouting?: RootRouting
): Promise<void | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Separate by level
  const roots = approvedNodes.filter((n) => n.parentTempId === null);
  const children = approvedNodes.filter(
    (n) => n.parentTempId !== null && roots.some((r) => r.temp_id === n.parentTempId)
  );
  const grandchildren = approvedNodes.filter(
    (n) => n.parentTempId !== null && children.some((c) => c.temp_id === n.parentTempId)
  );

  // Step 1: Get or create Inbox node
  const inboxId = await getOrCreateInboxNode(user.id, supabase);

  // Fetch Inbox metadata
  const { data: inboxNode } = await supabase
    .from("knowledge_nodes")
    .select("id, root_id, depth")
    .eq("id", inboxId)
    .single();

  if (!inboxNode) return { error: "Failed to get Inbox node" };

  // tempId → db id mapping
  const tempIdToDbId = new Map<string, string>();

  // parentMetaMap: dbId → { depth, root_id } for all parent nodes (inbox + inserted roots + merge targets)
  const parentMetaMap = new Map<string, { depth: number; root_id: string }>();
  parentMetaMap.set(inboxId, {
    depth: inboxNode.depth as number,
    root_id: inboxNode.root_id as string,
  });

  // Step 2: Handle roots — split into new vs merge
  const rootsForNew: typeof roots = [];
  const rootsForMerge: { root: (typeof roots)[0]; targetNodeId: string }[] = [];

  for (const r of roots) {
    const routing = rootRouting?.[r.temp_id];
    if (routing?.mode === "merge") {
      rootsForMerge.push({ root: r, targetNodeId: routing.targetNodeId });
    } else {
      rootsForNew.push(r);
    }
  }

  // Pre-populate tempIdToDbId for merge targets and fetch their metadata
  if (rootsForMerge.length > 0) {
    const mergeTargetIds = rootsForMerge.map((m) => m.targetNodeId);
    const { data: mergeTargetNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, depth, root_id")
      .in("id", mergeTargetIds)
      .eq("user_id", user.id);

    const mergeMetaById = new Map(
      (mergeTargetNodes ?? []).map((n) => [
        n.id as string,
        { depth: n.depth as number, root_id: n.root_id as string },
      ])
    );

    for (const { root, targetNodeId } of rootsForMerge) {
      tempIdToDbId.set(root.temp_id, targetNodeId);
      const meta = mergeMetaById.get(targetNodeId);
      if (meta) parentMetaMap.set(targetNodeId, meta);
    }
  }

  // Step 3: Insert new roots (dedup against existing Inbox children)
  if (rootsForNew.length > 0) {
    const { data: existingInboxChildren } = await supabase
      .from("knowledge_nodes")
      .select("title")
      .eq("parent_id", inboxId)
      .eq("user_id", user.id);

    const inboxChildTitlesLower = new Set(
      (existingInboxChildren ?? []).map((c) => (c.title as string).toLowerCase())
    );

    const seenRootTitles = new Set<string>();
    const dedupedRoots = rootsForNew.filter((r) => {
      const key = r.title.toLowerCase();
      if (seenRootTitles.has(key) || inboxChildTitlesLower.has(key)) return false;
      seenRootTitles.add(key);
      return true;
    });

    if (dedupedRoots.length > 0) {
      const inboxMeta = parentMetaMap.get(inboxId)!;
      const rootRows = dedupedRoots.map((r) => ({
        user_id: user.id,
        parent_id: inboxId,
        root_id: inboxMeta.root_id,
        title: r.title,
        node_type: r.nodeType,
        position_x: 0,
        position_y: 0,
        depth: inboxMeta.depth + 1,
        ai_generated: true,
        source: "extract",
        source_ref: extractionId,
        ai_evidence: r.evidence.slice(0, 120),
      }));

      const { data: insertedRoots, error: rootError } = await supabase
        .from("knowledge_nodes")
        .insert(rootRows)
        .select("id, title");

      if (rootError) {
        if (rootError.code === "23505") {
          // Unique violation — refetch existing Inbox children to recover IDs
          const { data: refetched } = await supabase
            .from("knowledge_nodes")
            .select("id, title")
            .eq("parent_id", inboxId)
            .eq("user_id", user.id);
          for (const n of refetched ?? []) {
            const original = dedupedRoots.find(
              (r) => r.title.toLowerCase() === (n.title as string).toLowerCase()
            );
            if (original) {
              tempIdToDbId.set(original.temp_id, n.id as string);
              parentMetaMap.set(n.id as string, {
                depth: inboxMeta.depth + 1,
                root_id: inboxMeta.root_id,
              });
            }
          }
        } else {
          return { error: rootError.message };
        }
      } else {
        for (const inserted of insertedRoots ?? []) {
          const original = dedupedRoots.find((r) => r.title === inserted.title);
          if (original) {
            tempIdToDbId.set(original.temp_id, inserted.id as string);
            parentMetaMap.set(inserted.id as string, {
              depth: inboxMeta.depth + 1,
              root_id: inboxMeta.root_id,
            });
          }
        }
      }
    }
  }

  // Helper: insert a batch of child/grandchild nodes with dedup + 23505 recovery
  async function insertLevel(
    nodes: ApprovedExtractionNode[]
  ): Promise<void | { error: string }> {
    if (nodes.length === 0) return;

    const parentIds = Array.from(
      new Set(nodes.map((n) => tempIdToDbId.get(n.parentTempId!)).filter(Boolean) as string[])
    );

    const { data: existingRows } = await supabase
      .from("knowledge_nodes")
      .select("id, title, parent_id")
      .in("parent_id", parentIds)
      .eq("user_id", user!.id);

    const existingByParent = new Map<string, Set<string>>();
    const existingIdByParentTitle = new Map<string, string>(); // `${parentId}::${titleLower}` → id
    for (const c of existingRows ?? []) {
      const pid = c.parent_id as string;
      const titleLower = (c.title as string).toLowerCase();
      if (!existingByParent.has(pid)) existingByParent.set(pid, new Set());
      existingByParent.get(pid)!.add(titleLower);
      existingIdByParentTitle.set(`${pid}::${titleLower}`, c.id as string);
    }

    const seenKeys = new Set<string>();
    const rows = nodes
      .filter((n) => {
        const parentDbId = tempIdToDbId.get(n.parentTempId!);
        if (!parentDbId) return false;
        const key = `${parentDbId}::${n.title.toLowerCase()}`;
        if (seenKeys.has(key)) return false;
        if ((existingByParent.get(parentDbId) ?? new Set()).has(n.title.toLowerCase())) {
          // Already exists — map tempId to existing id so descendants work
          const existingId = existingIdByParentTitle.get(key);
          if (existingId) tempIdToDbId.set(n.temp_id, existingId);
          return false;
        }
        seenKeys.add(key);
        return true;
      })
      .map((n) => {
        const parentDbId = tempIdToDbId.get(n.parentTempId!)!;
        const parentMeta = parentMetaMap.get(parentDbId) ?? {
          depth: (inboxNode!.depth as number),
          root_id: inboxNode!.root_id as string,
        };
        return {
          user_id: user!.id,
          parent_id: parentDbId,
          root_id: parentMeta.root_id,
          title: n.title,
          node_type: n.nodeType,
          position_x: 0,
          position_y: 0,
          depth: parentMeta.depth + 1,
          ai_generated: true,
          source: "extract",
          source_ref: extractionId,
          ai_evidence: n.evidence.slice(0, 120),
        };
      });

    if (rows.length === 0) return;

    const { data: inserted, error: insertError } = await supabase
      .from("knowledge_nodes")
      .insert(rows)
      .select("id, title, parent_id, depth, root_id");

    if (insertError) {
      if (insertError.code === "23505") {
        // Recover: refetch all children of all parent IDs
        const { data: refetched } = await supabase
          .from("knowledge_nodes")
          .select("id, title, parent_id, depth, root_id")
          .in("parent_id", parentIds)
          .eq("user_id", user!.id);
        for (const n of refetched ?? []) {
          const key = `${n.parent_id as string}::${(n.title as string).toLowerCase()}`;
          const original = nodes.find(
            (orig) =>
              tempIdToDbId.get(orig.parentTempId!) === (n.parent_id as string) &&
              orig.title.toLowerCase() === (n.title as string).toLowerCase()
          );
          if (original) {
            tempIdToDbId.set(original.temp_id, n.id as string);
            parentMetaMap.set(n.id as string, {
              depth: n.depth as number,
              root_id: n.root_id as string,
            });
          }
          existingIdByParentTitle.set(key, n.id as string);
        }
      } else {
        return { error: insertError.message };
      }
    } else {
      for (const ins of inserted ?? []) {
        const original = nodes.find(
          (n) =>
            n.title === ins.title &&
            tempIdToDbId.get(n.parentTempId!) === (ins.parent_id as string)
        );
        if (original) {
          tempIdToDbId.set(original.temp_id, ins.id as string);
          parentMetaMap.set(ins.id as string, {
            depth: ins.depth as number,
            root_id: ins.root_id as string,
          });
        }
      }
    }
  }

  // Step 4: Insert children
  const childResult = await insertLevel(children);
  if (childResult && "error" in childResult) return childResult;

  // Step 5: Insert grandchildren
  const gcResult = await insertLevel(grandchildren);
  if (gcResult && "error" in gcResult) return gcResult;

  // Step 6: Apply approved matches — merge add_facts into existing nodes
  if (approvedMatches.length > 0) {
    const matchNodeIds = approvedMatches.map((m) => m.matched_node_id);
    const { data: existingMatchNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, user_facts")
      .in("id", matchNodeIds)
      .eq("user_id", user.id);

    const factsById = new Map<string, string[]>(
      (existingMatchNodes ?? []).map((n) => [n.id as string, (n.user_facts as string[]) ?? []])
    );

    await Promise.all(
      approvedMatches
        .filter((m) => m.add_facts.length > 0)
        .map((m) => {
          const existing = factsById.get(m.matched_node_id) ?? [];
          const existingLower = new Set(existing.map((f) => f.toLowerCase()));
          const merged = [
            ...existing,
            ...m.add_facts.filter((f) => !existingLower.has(f.toLowerCase())),
          ];
          return supabase
            .from("knowledge_nodes")
            .update({ user_facts: merged, updated_at: new Date().toISOString() })
            .eq("id", m.matched_node_id)
            .eq("user_id", user.id);
        })
    );
  }

  revalidatePath("/learn/hub");
}
