"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
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
  addKnowledgeLink,
  deleteKnowledgeLink,
} from "@/lib/actions/knowledge";
import type { KnowledgeNode, KnowledgeLink, NodeResource } from "@/types/database";
import { KnowledgeNodeCard, type KnowledgeNodeData } from "@/components/knowledge-node-card";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import { SubtopicSuggestionSheet } from "@/components/subtopic-suggestion-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Maximize2, Loader2, Brain, ZoomIn, ZoomOut } from "lucide-react";
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

  // Track persisted positions for diffing
  const lastPersistedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

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
            onSelect: setSelectedNodeId,
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

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    async (_, __, nodes) => {
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

    const patchedNodes = newNodes.map((node, i) => ({
      ...node,
      position_x: parentX + (i - (N - 1) / 2) * CHILD_SPACING,
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

  const isEmpty = knowledgeNodes.length === 0;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView={!isEmpty}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} className="opacity-30" />
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
