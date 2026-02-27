"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  BaseEdge,
  getBezierPath,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type EdgeProps,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  addRootNode,
  deleteNode,
  updateNodePositions,
  suggestSubtopics,
  synthesizeNodes,
  updateNodeTitle,
} from "@/lib/actions/knowledge";
import type { KnowledgeNode, KnowledgeLink, NodeResource } from "@/types/database";
import type { SynthesisResult } from "@/lib/knowledge-utils";
import { KnowledgeNodeCard, type KnowledgeNodeData } from "@/components/knowledge-node-card";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import { SubtopicSuggestionSheet } from "@/components/subtopic-suggestion-sheet";
import { SynthesisPanel } from "@/components/synthesis-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Maximize2, Loader2, Brain, ZoomIn, ZoomOut, Focus, Map as MapIcon, Sparkles, LayoutGrid } from "lucide-react";
import { ROOT_COLORS } from "@/lib/knowledge-utils";

// Custom dashed cross-link edge (defined at module level, outside component)
function CrossLinkEdge({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, id }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.2 });
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{ stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "5,4", opacity: 0.7 }}
    />
  );
}

const NODE_TYPES = { knowledgeNode: KnowledgeNodeCard };
const EDGE_TYPES = { crossLink: CrossLinkEdge };

const TEMPLATE_TOPICS = ["History", "Science", "Anime"];

const X_SPACING = 220;
const Y_SPACING = 180;
const TREE_GAP = 350;

function computeAutoLayout(nodes: KnowledgeNode[]): Map<string, { x: number; y: number }> {
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_id) {
      const arr = childrenMap.get(n.parent_id) ?? [];
      arr.push(n.id);
      childrenMap.set(n.parent_id, arr);
    }
  }

  const widthCache = new Map<string, number>();
  function subtreeWidth(id: string): number {
    if (widthCache.has(id)) return widthCache.get(id)!;
    const children = childrenMap.get(id) ?? [];
    const w = children.length === 0 ? 1 : children.reduce((s, c) => s + subtreeWidth(c), 0);
    widthCache.set(id, w);
    return w;
  }

  const result = new Map<string, { x: number; y: number }>();
  function assign(id: string, leftX: number, y: number) {
    const width = subtreeWidth(id);
    result.set(id, { x: leftX + ((width - 1) / 2) * X_SPACING, y });
    const children = childrenMap.get(id) ?? [];
    let childLeft = leftX;
    for (const c of children) {
      assign(c, childLeft, y + Y_SPACING);
      childLeft += subtreeWidth(c) * X_SPACING;
    }
  }

  const roots = nodes.filter((n) => n.depth === 0);
  let rootX = 0;
  for (const root of roots) {
    assign(root.id, rootX, 0);
    rootX += subtreeWidth(root.id) * X_SPACING + TREE_GAP;
  }

  return result;
}

const GRID_SPACING = 250;

function getRootColor(node: KnowledgeNode, allNodes: KnowledgeNode[]): string {
  const rootNode = allNodes.find((n) => n.id === node.root_id);
  return rootNode?.color ?? ROOT_COLORS[0];
}

function collectDescendants(nodeId: string, nodes: KnowledgeNode[], acc: Set<string>) {
  for (const n of nodes) {
    if (n.parent_id === nodeId) {
      acc.add(n.id);
      collectDescendants(n.id, nodes, acc);
    }
  }
}

function collectFocusDescendants(rootId: string, childrenMap: Map<string, string[]>, acc: Set<string>) {
  const stack: string[] = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const k of (childrenMap.get(cur) ?? [])) {
      if (acc.has(k)) continue;
      acc.add(k);
      stack.push(k);
    }
  }
}

function collectFocusAncestors(id: string, parentMap: Map<string, string | null>, acc: Set<string>) {
  let cur: string = id;
  while (true) {
    const p: string | null = parentMap.get(cur) ?? null;
    if (!p || acc.has(p)) break;
    acc.add(p);
    cur = p;
  }
}

interface KnowledgeGraphInnerProps {
  initialNodes: KnowledgeNode[];
  initialLinks: KnowledgeLink[];
}

function KnowledgeGraphInner({ initialNodes, initialLinks }: KnowledgeGraphInnerProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>(initialNodes);
  const [knowledgeLinks, setKnowledgeLinks] = useState<KnowledgeLink[]>(initialLinks);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [addRootTitle, setAddRootTitle] = useState("");
  const [addRootPending, setAddRootPending] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [expandNodeId, setExpandNodeId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const [autoLayoutPending, setAutoLayoutPending] = useState(false);

  // Synthesis mode state
  const [synthesisModeActive, setSynthesisModeActive] = useState(false);
  const [synthesisSelectedIds, setSynthesisSelectedIds] = useState<Set<string>>(new Set());
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisDialogOpen, setSynthesisDialogOpen] = useState(false);

  // Track persisted positions for diffing
  const lastPersistedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Drag-click guard for synthesis mode
  const isDraggingRef = useRef(false);
  // Ref mirror for synthesis mode (for stable callbacks)
  const synthesisModeRef = useRef(false);

  const onToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Build React Flow nodes and edges from knowledge nodes
  const buildGraph = useCallback(
    (kNodes: KnowledgeNode[], kLinks: KnowledgeLink[], collapsed: Set<string>) => {
      // Auto-layout: if position is 0,0 for a root, spread them horizontally
      const rootNodes = kNodes.filter((n) => n.depth === 0);

      // Precompute child count and link count maps
      const childCountMap = new Map<string, number>();
      for (const n of kNodes) {
        if (n.parent_id) {
          childCountMap.set(n.parent_id, (childCountMap.get(n.parent_id) ?? 0) + 1);
        }
      }

      const linkCountMap = new Map<string, number>();
      for (const l of kLinks) {
        linkCountMap.set(l.a_id, (linkCountMap.get(l.a_id) ?? 0) + 1);
        linkCountMap.set(l.b_id, (linkCountMap.get(l.b_id) ?? 0) + 1);
      }

      // Compute hidden IDs from collapsed subtrees
      const hiddenIds = new Set<string>();
      Array.from(collapsed).forEach((collapsedId) => {
        collectDescendants(collapsedId, kNodes, hiddenIds);
      });

      const newRfNodes: Node[] = kNodes.map((node) => {
        const rootColor = getRootColor(node, kNodes);
        const isRoot = node.depth === 0;

        let x = node.position_x;
        let y = node.position_y;

        // Default layout for new nodes with no position
        if (x === 0 && y === 0 && isRoot) {
          const idx = rootNodes.indexOf(node);
          x = idx * GRID_SPACING;
          y = 0;
        }

        return {
          id: node.id,
          type: "knowledgeNode",
          position: { x, y },
          hidden: hiddenIds.has(node.id),
          data: {
            node,
            rootColor,
            onExpand: handleExpand,
            onDelete: (nodeId: string) => setDeleteConfirmId(nodeId),
            selected: false,
            hasUserContent:
              (node.user_notes !== null && node.user_notes !== "") ||
              (node.user_facts?.length ?? 0) > 0 ||
              (node.resources?.length ?? 0) > 0,
            nodeType: node.node_type ?? 'topic',
            masteryStatus: node.mastery_status ?? 'not_started',
            childCount: childCountMap.get(node.id) ?? 0,
            isCollapsed: collapsed.has(node.id),
            linkCount: linkCountMap.get(node.id) ?? 0,
            onToggleCollapse,
            isSynthesisSelected: false,
            onRename: handleRename,
          } satisfies KnowledgeNodeData,
        };
      });

      // Parent edges
      const parentEdges: Edge[] = kNodes
        .filter((n) => n.parent_id)
        .map((n) => ({
          id: `e-${n.parent_id}-${n.id}`,
          source: n.parent_id!,
          target: n.id,
          hidden: hiddenIds.has(n.id) || hiddenIds.has(n.parent_id!),
          style: {
            stroke: getRootColor(n, kNodes),
            strokeWidth: 1.5,
            strokeOpacity: 0.6,
          },
          animated: false,
        }));

      // Cross-link edges
      const linkEdges: Edge[] = kLinks.map((l) => ({
        id: `l-${l.id}`,
        source: l.a_id,
        target: l.b_id,
        type: "crossLink",
        hidden: hiddenIds.has(l.a_id) || hiddenIds.has(l.b_id),
      }));

      return { newRfNodes, newEdges: [...parentEdges, ...linkEdges] };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onToggleCollapse]
  );

  // Rebuild graph when knowledge nodes, links, or collapsed state changes
  useEffect(() => {
    const { newRfNodes, newEdges } = buildGraph(knowledgeNodes, knowledgeLinks, collapsedIds);

    setRfNodes((prev) => {
      // Preserve current drag positions for existing nodes
      const posMap = new Map(prev.map((n) => [n.id, n.position]));
      return newRfNodes.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setRfEdges(newEdges);
  }, [knowledgeNodes, knowledgeLinks, collapsedIds, buildGraph]);

  // Update selected state on rfNodes
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...(n.data as unknown as KnowledgeNodeData),
          selected: n.id === selectedNodeId,
        } as unknown as Record<string, unknown>,
      }))
    );
  }, [selectedNodeId]);

  // Sync synthesis mode ref
  useEffect(() => {
    synthesisModeRef.current = synthesisModeActive;
  }, [synthesisModeActive]);

  // Update synthesis selection highlight on rfNodes
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...(n.data as unknown as KnowledgeNodeData),
          isSynthesisSelected: synthesisSelectedIds.has(n.id),
        } as unknown as Record<string, unknown>,
      }))
    );
  }, [synthesisSelectedIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeDragStart: OnNodeDrag = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    async (_, __, nodes) => {
      setTimeout(() => { isDraggingRef.current = false; }, 50);
      const changed: { id: string; x: number; y: number }[] = [];
      for (const n of nodes) {
        const last = lastPersistedPositions.current.get(n.id);
        if (!last || last.x !== n.position.x || last.y !== n.position.y) {
          changed.push({ id: n.id, x: n.position.x, y: n.position.y });
          lastPersistedPositions.current.set(n.id, n.position);
        }
      }
      if (changed.length > 0) {
        const result = await updateNodePositions(changed);
        if (result && "error" in result) {
          toast.error("Failed to save position");
        }
      }
    },
    []
  );

  const onNodeClick = useCallback((_evt: unknown, node: Node) => {
    if (isDraggingRef.current) return;
    if (synthesisModeRef.current) {
      setSynthesisSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(node.id) ? next.delete(node.id) : next.add(node.id);
        return next;
      });
      return;
    }
    setSelectedNodeId(node.id);
  }, []);

  // Keyboard handlers
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedNodeId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        setDeleteConfirmId(selectedNodeId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId]);

  // Cmd+K spotlight
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Synthesis mode keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!synthesisModeActive || synthesisDialogOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        exitSynthesisMode();
      }
      if (e.key === "Enter" && synthesisSelectedIds.size >= 2 && !synthesisLoading) {
        e.preventDefault();
        handleSynthesize();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesisModeActive, synthesisDialogOpen, synthesisSelectedIds, synthesisLoading]);

  function enterSynthesisMode() {
    setSynthesisModeActive(true);
    setSelectedNodeId(null);
    setFocusEnabled(false);
  }

  function exitSynthesisMode() {
    setSynthesisModeActive(false);
    setSynthesisSelectedIds(new Set());
    setSynthesisResult(null);
    setSynthesisLoading(false);
    setSynthesisDialogOpen(false);
  }

  async function handleSynthesize() {
    const ids = Array.from(synthesisSelectedIds);
    setSynthesisLoading(true);
    const result = await synthesizeNodes(ids);
    setSynthesisLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setSynthesisResult(result);
    setSynthesisDialogOpen(true);
  }

  async function handleExpand(nodeId: string) {
    setExpandNodeId(nodeId);
    setSuggestions([]);
    setSuggestionsLoading(true);
    setSheetOpen(true);
    const result = await suggestSubtopics(nodeId);
    setSuggestionsLoading(false);
    if ("error" in result) {
      toast.error("Failed to get suggestions: " + result.error);
      setSheetOpen(false);
      return;
    }
    setSuggestions(result.suggestions);
  }

  async function handleAddRoot() {
    const trimmed = addRootTitle.trim();
    if (!trimmed) return;
    setAddRootPending(true);
    const rootCount = knowledgeNodes.filter((n) => n.depth === 0).length;
    const x = rootCount * GRID_SPACING;
    const y = 0;
    const result = await addRootNode(trimmed);
    setAddRootPending(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const patchedNode = { ...result.node, position_x: x, position_y: y };
    updateNodePositions([{ id: result.node.id, x, y }]);
    lastPersistedPositions.current.set(result.node.id, { x, y });
    setKnowledgeNodes((prev) => [...prev, patchedNode]);
    setAddRootTitle("");
    setAddRootOpen(false);
    toast.success(`Added "${result.node.title}"`);
  }

  async function handleDelete() {
    if (!deleteConfirmId) return;
    setDeletePending(true);
    const result = await deleteNode(deleteConfirmId);
    setDeletePending(false);
    setDeleteConfirmId(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const deletedSet = new Set(result.deleted_ids);
    setKnowledgeNodes((prev) => prev.filter((n) => !deletedSet.has(n.id)));
    // Clean up any links involving deleted nodes
    setKnowledgeLinks((prev) =>
      prev.filter((l) => !deletedSet.has(l.a_id) && !deletedSet.has(l.b_id))
    );
    if (selectedNodeId && deletedSet.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    toast.success("Deleted");
  }

  async function handleSubtopicsAdded(newNodes: KnowledgeNode[]) {
    if (newNodes.length === 0) return;

    const parentId = newNodes[0].parent_id;
    const parentRfNode = rfNodes.find((n) => n.id === parentId);
    const parentX = parentRfNode?.position.x ?? 0;
    const parentY = parentRfNode?.position.y ?? 0;

    const N = newNodes.length;
    const CHILD_SPACING = 180;
    const CHILD_Y_OFFSET = 180;

    // Count existing children from canonical list so sequential quick-adds spread out
    const existingChildCount = knowledgeNodes.filter(
      (n) => n.parent_id === parentId && !newNodes.some((nn) => nn.id === n.id)
    ).length;

    const patchedNodes = newNodes.map((node, i) => ({
      ...node,
      position_x: parentX + (existingChildCount + i - (N - 1) / 2) * CHILD_SPACING,
      position_y: parentY + CHILD_Y_OFFSET,
    }));

    const positions = patchedNodes.map((n) => ({
      id: n.id,
      x: n.position_x,
      y: n.position_y,
    }));

    updateNodePositions(positions);
    for (const { id, x, y } of positions) {
      lastPersistedPositions.current.set(id, { x, y });
    }

    setKnowledgeNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const fresh = patchedNodes.filter((n) => !existingIds.has(n.id));
      return [...prev, ...fresh];
    });
  }

  function handleJumpToNode(nodeId: string) {
    fitView({ nodes: [{ id: nodeId }], duration: 500, padding: 0.5 });
  }

  function handleSpotlightSelect(nodeId: string) {
    setSelectedNodeId(nodeId);
    fitView({ nodes: [{ id: nodeId }], duration: 400, padding: 0.5 });
    setSpotlightOpen(false);
  }

  function getNodePath(node: KnowledgeNode): string {
    const nodeById = new Map(knowledgeNodes.map((n) => [n.id, n]));
    const chain: string[] = [];
    let cur = node.parent_id ? nodeById.get(node.parent_id) : undefined;
    while (cur) {
      chain.unshift(cur.title);
      cur = cur.parent_id ? nodeById.get(cur.parent_id) : undefined;
    }
    return chain.join(" › ");
  }

  function handleNotesChange(nodeId: string, notes: string | null) {
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, user_notes: notes } : n))
    );
  }

  function handleResourcesChange(nodeId: string, resources: NodeResource[]) {
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, resources } : n))
    );
  }

  function handleUserFactsChange(nodeId: string, facts: string[]) {
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, user_facts: facts } : n))
    );
  }

  function handleMasteryChange(nodeId: string, mastery_status: KnowledgeNode['mastery_status'], confidence_score: number | null, last_reviewed_at: string | null) {
    setKnowledgeNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, mastery_status, confidence_score, last_reviewed_at } : n
      )
    );
  }

  function handleNodeTypeChange(nodeId: string, node_type: KnowledgeNode['node_type']) {
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, node_type } : n))
    );
  }

  function handleLinkAdd(link: KnowledgeLink) {
    setKnowledgeLinks((prev) => [...prev, link]);
  }

  function handleLinkDelete(linkId: string) {
    setKnowledgeLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  async function handleRename(nodeId: string, newTitle: string) {
    const result = await updateNodeTitle(nodeId, newTitle);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, title: result.title } : n))
    );
  }

  function handleNodeMoved(updatedNodes: KnowledgeNode[]) {
    const updateMap = new Map(updatedNodes.map((n) => [n.id, n]));
    setKnowledgeNodes((prev) =>
      prev.map((n) => updateMap.get(n.id) ?? n)
    );
  }

  async function handleAutoLayout() {
    setAutoLayoutPending(true);
    const layoutMap = computeAutoLayout(knowledgeNodes);
    const updates: { id: string; x: number; y: number }[] = [];
    layoutMap.forEach((pos, id) => {
      updates.push({ id, x: pos.x, y: pos.y });
      lastPersistedPositions.current.set(id, pos);
    });
    setRfNodes((prev) =>
      prev.map((n) => {
        const pos = layoutMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      })
    );
    await updateNodePositions(updates);
    setAutoLayoutPending(false);
    setTimeout(() => fitView({ duration: 500 }), 50);
  }

  function handleDescriptionChange(nodeId: string, description: string | null) {
    setKnowledgeNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, description } : n))
    );
  }

  const selectedNode = knowledgeNodes.find((n) => n.id === selectedNodeId) ?? null;
  const expandNode = knowledgeNodes.find((n) => n.id === expandNodeId) ?? null;
  const selectedRootColor = selectedNode
    ? getRootColor(selectedNode, knowledgeNodes)
    : ROOT_COLORS[0];

  const existingChildTitles = useMemo(() => {
    if (!expandNodeId) return [];
    return knowledgeNodes
      .filter((n) => n.parent_id === expandNodeId)
      .map((n) => n.title);
  }, [expandNodeId, knowledgeNodes]);

  // Links relevant to the selected node
  const selectedNodeLinks = useMemo(() => {
    if (!selectedNodeId) return [];
    return knowledgeLinks.filter(
      (l) => l.a_id === selectedNodeId || l.b_id === selectedNodeId
    );
  }, [selectedNodeId, knowledgeLinks]);

  // Focus mode — precompute traversal maps
  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of knowledgeNodes) {
      if (!n.parent_id) continue;
      const arr = m.get(n.parent_id) ?? [];
      arr.push(n.id);
      m.set(n.parent_id, arr);
    }
    return m;
  }, [knowledgeNodes]);

  const parentMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const n of knowledgeNodes) m.set(n.id, n.parent_id ?? null);
    return m;
  }, [knowledgeNodes]);

  const neighborsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };
    for (const l of knowledgeLinks) { add(l.a_id, l.b_id); add(l.b_id, l.a_id); }
    return m;
  }, [knowledgeLinks]);

  // focusSet: nodes that should remain fully visible
  const focusSet = useMemo((): Set<string> | null => {
    if (!focusEnabled || !selectedNodeId) return null;
    const acc = new Set<string>([selectedNodeId]);
    collectFocusAncestors(selectedNodeId, parentMap, acc);
    collectFocusDescendants(selectedNodeId, childrenMap, acc);
    neighborsMap.get(selectedNodeId)?.forEach(x => acc.add(x));
    return acc;
  }, [focusEnabled, selectedNodeId, parentMap, childrenMap, neighborsMap]);

  // Presentation layer — apply focus fading without mutating state
  const displayNodes = useMemo(() =>
    rfNodes.map(n => {
      if (!focusSet || focusSet.has(n.id)) return n;
      return { ...n, style: { ...(n.style ?? {}), opacity: 0.15, pointerEvents: "none" as const } };
    }), [rfNodes, focusSet]);

  const displayEdges = useMemo(() =>
    rfEdges.map(e => {
      if (!focusSet || (focusSet.has(e.source) && focusSet.has(e.target))) return e;
      return { ...e, style: { ...(e.style ?? {}), opacity: 0.08 } };
    }), [rfEdges, focusSet]);

  const isEmpty = knowledgeNodes.length === 0;

  const selectedSynthesisNodes = synthesisResult
    ? knowledgeNodes.filter((n) => synthesisSelectedIds.has(n.id))
    : [];

  return (
    <div className="relative h-full w-full">
      {/* Synthesis mode banner */}
      {synthesisModeActive && (
        <div className="absolute top-0 left-0 right-0 bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 text-center text-sm text-blue-600 dark:text-blue-400 z-20 pointer-events-none">
          Click nodes to select for synthesis — {synthesisSelectedIds.size} selected
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={() => { setSelectedNodeId(null); setFocusEnabled(false); }}
        fitView={!isEmpty}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} className="opacity-30" />
        {minimapVisible && (
          <MiniMap
            nodeColor={(n) => (n.data as unknown as KnowledgeNodeData).rootColor ?? "#94a3b8"}
            nodeBorderRadius={4}
            maskColor="rgba(0,0,0,0.15)"
            className="rounded-lg border border-border"
          />
        )}
      </ReactFlow>

      {/* Empty state */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-xl font-semibold">Your knowledge graph is empty</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Start by adding a topic you want to explore and learn about.
            </p>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            {TEMPLATE_TOPICS.map((topic) => (
              <button
                key={topic}
                className="px-4 py-2 rounded-full border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                onClick={async () => {
                  const result = await addRootNode(topic);
                  if ("node" in result) {
                    setKnowledgeNodes((prev) => [...prev, result.node]);
                    toast.success(`Added "${topic}"`);
                  }
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {/* Zoom controls */}
        <div className="flex rounded-md border bg-background shadow-sm overflow-hidden">
          <button
            className="px-2 py-1.5 hover:bg-muted transition-colors border-r"
            onClick={() => zoomOut({ duration: 200 })}
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            className="px-2 py-1.5 hover:bg-muted transition-colors"
            onClick={() => zoomIn({ duration: 200 })}
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSpotlightOpen(true)}
          title="Search nodes (⌘K)"
          className="font-mono text-xs px-2.5"
        >
          ⌘K
        </Button>
        <Button
          variant={minimapVisible ? "default" : "outline"}
          size="sm"
          onClick={() => setMinimapVisible(m => !m)}
          title="Toggle minimap"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
        <Button
          variant={focusEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => setFocusEnabled(f => !f)}
          title="Focus on selected node"
        >
          <Focus className="h-4 w-4 mr-1.5" />
          Focus
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoLayout}
          disabled={autoLayoutPending || knowledgeNodes.length === 0}
          title="Auto-arrange nodes"
        >
          {autoLayoutPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <LayoutGrid className="h-4 w-4 mr-1.5" />
          )}
          Layout
        </Button>
        <Button
          variant={synthesisModeActive ? "default" : "outline"}
          size="sm"
          onClick={() => synthesisModeActive ? exitSynthesisMode() : enterSynthesisMode()}
          title="Synthesis mode"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          Synthesize
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fitView({ duration: 500 })}
        >
          <Maximize2 className="h-4 w-4 mr-1.5" />
          Recenter
        </Button>
        <Button
          size="sm"
          onClick={() => setAddRootOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Topic
        </Button>
      </div>

      {/* Synthesis floating action bar */}
      {synthesisModeActive && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background border rounded-full px-4 py-2 shadow-lg z-50">
          <span className="text-sm text-muted-foreground">
            {synthesisSelectedIds.size} node{synthesisSelectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            disabled={synthesisSelectedIds.size < 2 || synthesisLoading}
            onClick={handleSynthesize}
          >
            {synthesisLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            Synthesize
          </Button>
          <Button size="sm" variant="ghost" onClick={exitSynthesisMode}>
            Cancel
          </Button>
        </div>
      )}

      {/* Detail panel */}
      <NodeDetailPanel
        node={selectedNode}
        nodes={knowledgeNodes}
        allNodes={knowledgeNodes}
        nodeLinks={selectedNodeLinks}
        onClose={() => setSelectedNodeId(null)}
        onJumpToNode={handleJumpToNode}
        rootColor={selectedRootColor}
        onNotesChange={handleNotesChange}
        onResourcesChange={handleResourcesChange}
        onUserFactsChange={handleUserFactsChange}
        onMasteryChange={handleMasteryChange}
        onNodeTypeChange={handleNodeTypeChange}
        onLinkAdd={handleLinkAdd}
        onLinkDelete={handleLinkDelete}
        onChildAdded={handleSubtopicsAdded}
        onTitleChange={handleRename}
        onNodeMoved={handleNodeMoved}
        onDescriptionChange={handleDescriptionChange}
      />

      {/* Add root dialog */}
      <Dialog open={addRootOpen} onOpenChange={setAddRootOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new topic</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. Japanese History, Machine Learning…"
            value={addRootTitle}
            onChange={(e) => setAddRootTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddRoot();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRootOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRoot} disabled={addRootPending || !addRootTitle.trim()}>
              {addRootPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this node?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the node and all its subtopics.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePending}>
              {deletePending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subtopic suggestion sheet */}
      {suggestionsLoading && sheetOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-full px-4 py-2 flex items-center gap-2 shadow-lg z-50">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Generating suggestions…</span>
        </div>
      )}

      <SubtopicSuggestionSheet
        key={expandNodeId ?? "no-expand"}
        open={sheetOpen && !suggestionsLoading}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setExpandNodeId(null);
        }}
        parentNode={expandNode}
        suggestions={suggestions}
        existingChildTitles={existingChildTitles}
        onAdded={handleSubtopicsAdded}
      />

      {/* Synthesis result dialog */}
      {synthesisResult && (
        <SynthesisPanel
          open={synthesisDialogOpen}
          result={synthesisResult}
          selectedNodes={selectedSynthesisNodes}
          onClose={exitSynthesisMode}
        />
      )}

      {/* Spotlight search */}
      <CommandDialog open={spotlightOpen} onOpenChange={setSpotlightOpen}>
        <CommandInput placeholder="Jump to node…" />
        <CommandList>
          <CommandEmpty>No nodes found.</CommandEmpty>
          <CommandGroup>
            {knowledgeNodes.map((n) => {
              const path = getNodePath(n);
              return (
                <CommandItem
                  key={n.id}
                  value={path ? `${n.title} ${path}` : n.title}
                  onSelect={() => handleSpotlightSelect(n.id)}
                  className="flex flex-col items-start gap-0 py-2 cursor-pointer"
                >
                  <span className="text-sm font-medium">{n.title}</span>
                  {path && (
                    <span className="text-xs text-muted-foreground">{path}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

export function KnowledgeGraph({
  initialNodes,
  initialLinks,
}: {
  initialNodes: KnowledgeNode[];
  initialLinks: KnowledgeLink[];
}) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner initialNodes={initialNodes} initialLinks={initialLinks} />
    </ReactFlowProvider>
  );
}
