"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  getNodeDetail,
  saveUserNotes,
  saveResources,
  saveUserFacts,
  updateNodeType,
  updateMastery,
  addKnowledgeLink,
  deleteKnowledgeLink,
  addChildNodes,
  findGaps,
  moveNode,
  saveDescription,
  promoteFactToNode,
} from "@/lib/actions/knowledge";
import type { GapAnalysis } from "@/lib/knowledge-utils";
import type { KnowledgeNode, KnowledgeLink, NodeResource, NodeType, MasteryStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  X,
  ChevronRight,
  Loader2,
  Sparkles,
  BookOpen,
  Trash2,
  Plus,
  Star,
  Lightbulb,
  User,
  Book,
  Zap,
  FolderOpen,
  HelpCircle,
  Check,
  ScanSearch,
  Edit2,
  Home,
  Move,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NodeDetailPanelProps {
  node: KnowledgeNode | null;
  nodes: KnowledgeNode[];
  allNodes: KnowledgeNode[];
  nodeLinks: KnowledgeLink[];
  onClose: () => void;
  onJumpToNode: (nodeId: string) => void;
  rootColor: string;
  onNotesChange: (nodeId: string, notes: string | null) => void;
  onResourcesChange: (nodeId: string, resources: NodeResource[]) => void;
  onUserFactsChange: (nodeId: string, facts: string[]) => void;
  onMasteryChange: (nodeId: string, mastery_status: MasteryStatus, confidence_score: number | null, last_reviewed_at: string | null) => void;
  onNodeTypeChange: (nodeId: string, node_type: NodeType) => void;
  onLinkAdd: (link: KnowledgeLink) => void;
  onLinkDelete: (linkId: string) => void;
  onChildAdded?: (newNodes: KnowledgeNode[]) => void;
  onTitleChange?: (nodeId: string, newTitle: string) => Promise<void>;
  onNodeMoved?: (nodes: KnowledgeNode[]) => void;
  onDescriptionChange?: (nodeId: string, description: string | null) => void;
}

interface DetailState {
  summary: string;
  key_facts: string[];
}

const NODE_TYPE_OPTIONS: { type: NodeType; label: string; icon: LucideIcon | null }[] = [
  { type: 'topic', label: 'Topic', icon: BookOpen },
  { type: 'concept', label: 'Concept', icon: Lightbulb },
  { type: 'person', label: 'Person', icon: User },
  { type: 'book', label: 'Book', icon: Book },
  { type: 'skill', label: 'Skill', icon: Zap },
  { type: 'project', label: 'Project', icon: FolderOpen },
  { type: 'question', label: 'Question', icon: HelpCircle },
  { type: 'insight', label: 'Insight', icon: Sparkles },
];

const MASTERY_OPTIONS: { status: MasteryStatus; label: string; color: string }[] = [
  { status: 'not_started', label: 'Not started', color: '#94a3b8' },
  { status: 'learning', label: 'Learning', color: '#3b82f6' },
  { status: 'practicing', label: 'Practicing', color: '#f97316' },
  { status: 'mastered', label: 'Mastered', color: '#22c55e' },
];

function getDescendantIds(nodeId: string, allNodes: KnowledgeNode[]): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const n of allNodes) {
      if (n.parent_id === cur && !result.has(n.id)) {
        result.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return result;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function ProvenanceBadge({
  source,
  aiEvidence,
}: {
  source: 'digest' | 'extract' | 'scaffold';
  aiEvidence: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const label = source === 'extract' ? 'AI Extracted' : source === 'digest' ? 'From Digest' : 'Scaffolded';
  const badgeClass =
    source === 'extract'
      ? 'bg-blue-500/10 text-blue-700 border-blue-300/50'
      : source === 'digest'
        ? 'bg-purple-500/10 text-purple-700 border-purple-300/50'
        : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', badgeClass)}>
          {label}
        </Badge>
        {aiEvidence && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 px-1 text-[10px] text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'View'}
          </Button>
        )}
      </div>
      {aiEvidence && !expanded && (
        <p className="text-[10px] text-muted-foreground italic truncate">{aiEvidence}</p>
      )}
      {aiEvidence && expanded && (
        <div className="text-[10px] text-muted-foreground italic max-h-28 overflow-y-auto rounded border px-2 py-1.5 bg-muted/30">
          {aiEvidence}
        </div>
      )}
    </div>
  );
}

export function NodeDetailPanel({
  node,
  nodes,
  allNodes,
  nodeLinks,
  onClose,
  onJumpToNode,
  rootColor,
  onNotesChange,
  onResourcesChange,
  onUserFactsChange,
  onMasteryChange,
  onNodeTypeChange,
  onLinkAdd,
  onLinkDelete,
  onChildAdded,
  onTitleChange,
  onNodeMoved,
  onDescriptionChange,
}: NodeDetailPanelProps) {
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User content state
  const [localNotes, setLocalNotes] = useState<string>(node?.user_notes ?? "");
  const [localResources, setLocalResources] = useState<NodeResource[]>(node?.resources ?? []);
  const [localUserFacts, setLocalUserFacts] = useState<string[]>(node?.user_facts ?? []);
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [resourcesSaving, setResourcesSaving] = useState(false);
  const [factsSaving, setFactsSaving] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addFact, setAddFact] = useState("");

  // Mastery local state
  const [localStatus, setLocalStatus] = useState<MasteryStatus>(node?.mastery_status ?? 'not_started');
  const [localConfidence, setLocalConfidence] = useState<number | null>(node?.confidence_score ?? null);
  const [masterySaving, setMasterySaving] = useState(false);
  const prevStatusRef = useRef<MasteryStatus>(node?.mastery_status ?? 'not_started');

  // Node type local state
  const [localNodeType, setLocalNodeType] = useState<NodeType>(node?.node_type ?? 'topic');
  const [nodeTypeSaving, setNodeTypeSaving] = useState(false);

  // Connections state
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  // Child-add state
  const [showChildInput, setShowChildInput] = useState(false);
  const [childInput, setChildInput] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  // Find Gaps state
  const [gapResult, setGapResult] = useState<GapAnalysis | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [addedGapItems, setAddedGapItems] = useState<Set<string>>(new Set());

  // Rename state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

  // Move state
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);

  // Sibling state
  const [showSiblingInput, setShowSiblingInput] = useState(false);
  const [siblingInput, setSiblingInput] = useState("");
  const [addingSibling, setAddingSibling] = useState(false);

  // Batch child add state
  const [batchInput, setBatchInput] = useState("");
  const [addingBatch, setAddingBatch] = useState(false);
  const [showBatchInput, setShowBatchInput] = useState(false);

  // Description edit state
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);

  useEffect(() => {
    setEditDescription(detail?.summary ?? "");
  }, [detail]);

  const fetchDetail = useCallback(
    async (nodeId: string) => {
      setDetail(null);
      setError(null);
      setIsGenerating(false);

      const result = await getNodeDetail(nodeId);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if ("generating" in result) {
        setIsGenerating(true);
        return;
      }

      setDetail(result);
      setIsGenerating(false);
    },
    []
  );

  // Poll when generating
  useEffect(() => {
    if (!isGenerating || !node) return;
    const timer = setTimeout(() => fetchDetail(node.id), 2000);
    return () => clearTimeout(timer);
  }, [isGenerating, node, fetchDetail]);

  // Fetch on node change
  useEffect(() => {
    if (!node) return;
    fetchDetail(node.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, fetchDetail]);

  // Reset local state when selected node changes
  useEffect(() => {
    if (!node) return;
    setLocalNotes(node.user_notes ?? "");
    setLocalResources(node.resources ?? []);
    setLocalUserFacts(node.user_facts ?? []);
    setNotesDirty(false);
    setLocalStatus(node.mastery_status ?? 'not_started');
    setLocalConfidence(node.confidence_score ?? null);
    prevStatusRef.current = node.mastery_status ?? 'not_started';
    setLocalNodeType(node.node_type ?? 'topic');
    setShowChildInput(false);
    setChildInput("");
    setGapResult(null);
    setGapLoading(false);
    setAddedGapItems(new Set());
    setIsEditingTitle(false);
    setEditingTitle(node?.title ?? "");
    setMovePickerOpen(false);
    setMoveSaving(false);
    setShowSiblingInput(false);
    setSiblingInput("");
    setIsEditingDescription(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  async function handleSaveNotes() {
    if (!node) return;
    setNotesSaving(true);
    const result = await saveUserNotes(node.id, localNotes);
    setNotesSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onNotesChange(node.id, result.user_notes);
    setNotesDirty(false);
    toast.success("Notes saved");
  }

  async function handleAddResource() {
    if (!node || !addUrl.trim()) return;
    if (!addUrl.startsWith("http://") && !addUrl.startsWith("https://")) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    const newResource: NodeResource = {
      url: addUrl.trim(),
      label: addLabel.trim() || null,
    };
    const updated = [...localResources, newResource];
    setResourcesSaving(true);
    const result = await saveResources(node.id, updated);
    setResourcesSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setLocalResources(result.resources);
    onResourcesChange(node.id, result.resources);
    setAddUrl("");
    setAddLabel("");
  }

  async function handleDeleteResource(index: number) {
    if (!node) return;
    const updated = localResources.filter((_, i) => i !== index);
    setResourcesSaving(true);
    const result = await saveResources(node.id, updated);
    setResourcesSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setLocalResources(result.resources);
    onResourcesChange(node.id, result.resources);
  }

  async function handleAddFact() {
    if (!node || !addFact.trim()) return;
    const updated = [...localUserFacts, addFact.trim()];
    setFactsSaving(true);
    const result = await saveUserFacts(node.id, updated);
    setFactsSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setLocalUserFacts(result.user_facts);
    onUserFactsChange(node.id, result.user_facts);
    setAddFact("");
  }

  async function handleDeleteFact(index: number) {
    if (!node) return;
    const updated = localUserFacts.filter((_, i) => i !== index);
    setFactsSaving(true);
    const result = await saveUserFacts(node.id, updated);
    setFactsSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setLocalUserFacts(result.user_facts);
    onUserFactsChange(node.id, result.user_facts);
  }

  async function handlePromoteFact(index: number) {
    if (!node) return;
    const factText = localUserFacts[index];

    // Optimistic UI updates
    const newFacts = [...localUserFacts];
    newFacts.splice(index, 1);
    setLocalUserFacts(newFacts);
    setAddFact("");

    setFactsSaving(true);
    const result = await promoteFactToNode(node.id, index, factText);
    setFactsSaving(false);

    if ("error" in result) {
      toast.error(result.error);
      // Revert optimistic update
      setLocalUserFacts([...localUserFacts]);
      return;
    }

    onChildAdded?.([result.node]);
    onUserFactsChange?.(node.id, result.remainingFacts);
    toast.success("Takeaway promoted to node");
  }

  async function handleNodeTypeSelect(type: NodeType) {
    if (!node || type === localNodeType) return;
    setLocalNodeType(type);
    setNodeTypeSaving(true);
    const result = await updateNodeType(node.id, type);
    setNodeTypeSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      setLocalNodeType(localNodeType);
      return;
    }
    onNodeTypeChange(node.id, result.node_type);
  }

  async function handleStatusChange(status: MasteryStatus) {
    if (!node) return;
    const prev = prevStatusRef.current;
    setLocalStatus(status);
    setMasterySaving(true);
    const result = await updateMastery(node.id, status, localConfidence, prev);
    setMasterySaving(false);
    if ("error" in result) {
      toast.error(result.error);
      setLocalStatus(prev);
      return;
    }
    prevStatusRef.current = result.mastery_status;
    onMasteryChange(node.id, result.mastery_status, result.confidence_score, result.last_reviewed_at);
  }

  async function handleConfidenceChange(score: number) {
    if (!node) return;
    const newScore = localConfidence === score ? null : score;
    setLocalConfidence(newScore);
    setMasterySaving(true);
    // Pass same status as previous to avoid updating last_reviewed_at
    const result = await updateMastery(node.id, localStatus, newScore, localStatus);
    setMasterySaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onMasteryChange(node.id, result.mastery_status, result.confidence_score, result.last_reviewed_at);
  }

  async function handleAddLink(targetNodeId: string) {
    if (!node) return;
    setLinkPickerOpen(false);
    setLinkSaving(true);
    const result = await addKnowledgeLink(node.id, targetNodeId);
    setLinkSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onLinkAdd(result.link);
  }

  async function handleDeleteLink(linkId: string) {
    setDeletingLinkId(linkId);
    const result = await deleteKnowledgeLink(linkId);
    setDeletingLinkId(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onLinkDelete(linkId);
  }

  async function handleAddChild() {
    if (!node || !childInput.trim()) return;
    setAddingChild(true);
    const result = await addChildNodes(node.id, [childInput.trim()], false);
    setAddingChild(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onChildAdded?.(result.nodes);
    setChildInput("");
    setShowChildInput(false);
    toast.success("Child node added");
  }

  async function handleConfirmRename() {
    if (!node) return;
    const trimmed = editingTitle.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === node.title) return;
    await onTitleChange?.(node.id, trimmed);
  }

  async function handleMoveNode(newParentId: string | null) {
    if (!node) return;
    setMovePickerOpen(false);
    setMoveSaving(true);
    const result = await moveNode(node.id, newParentId);
    setMoveSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onNodeMoved?.(result.nodes);
    toast.success(newParentId === null ? "Node is now a root topic" : "Node moved");
  }

  async function handleAddSibling() {
    if (!node || !siblingInput.trim() || !node.parent_id) return;
    setAddingSibling(true);
    const result = await addChildNodes(node.parent_id, [siblingInput.trim()], false);
    setAddingSibling(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onChildAdded?.(result.nodes);
    setSiblingInput("");
    setShowSiblingInput(false);
    toast.success("Sibling node added");
  }

  async function handleBatchAdd() {
    if (!node || !batchInput.trim()) return;
    // Parse: split by newlines, then by commas; trim; deduplicate
    const rawTokens = batchInput
      .split("\n")
      .flatMap((line) => line.split(","))
      .map((t) => t.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const t of rawTokens) {
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        titles.push(t);
      }
    }
    if (titles.length === 0) return;

    setAddingBatch(true);
    const result = await addChildNodes(node.id, titles, false);
    setAddingBatch(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const added = result.nodes.length;
    const skipped = titles.length - added;
    onChildAdded?.(result.nodes);
    setBatchInput("");
    setShowBatchInput(false);
    toast.success(
      `Added ${added} child${added !== 1 ? "ren" : ""}` +
      (skipped > 0 ? `, skipped ${skipped} duplicate${skipped !== 1 ? "s" : ""}` : "")
    );
  }

  async function handleSaveDescription() {
    if (!node) return;
    const trimmed = editDescription.trim();
    const value = trimmed === "" ? null : trimmed;
    setDescriptionSaving(true);
    const result = await saveDescription(node.id, value);
    setDescriptionSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setDetail(value ? { summary: value, key_facts: detail?.key_facts ?? [] } : null);
    setIsEditingDescription(false);
    onDescriptionChange?.(node.id, result.description);
    toast.success("Description saved");
  }

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

  function normalizeGapItem(s: string) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
  }

  async function handleFindGaps() {
    if (!node) return;
    setGapLoading(true);
    setGapResult(null);
    const result = await findGaps(node.id);
    setGapLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setGapResult({
      foundational: dedupeAndCap(result.foundational, 4),
      advanced: dedupeAndCap(result.advanced, 3),
      learning_path: dedupeAndCap(result.learning_path, 5),
    });
  }

  async function handleAddGapItem(item: string) {
    if (!node) return;
    const key = normalizeGapItem(item);
    if (addedGapItems.has(key)) return;
    const result = await addChildNodes(node.id, [item], false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setAddedGapItems((prev) => new Set(Array.from(prev).concat(key)));
    onChildAdded?.(result.nodes);
  }

  // These useMemo hooks must come before the early return to satisfy Rules of Hooks
  const descendantIds = useMemo(
    () => node ? getDescendantIds(node.id, allNodes) : new Set<string>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node?.id, allNodes]
  );
  const movableNodes = useMemo(
    () => node ? allNodes.filter((n) => n.id !== node.id && !descendantIds.has(n.id)) : [],
    [allNodes, node, descendantIds]
  );

  // Build breadcrumb
  const breadcrumb = buildBreadcrumb(node, nodes);

  if (!node) return null;

  const childCount = nodes.filter((n) => n.parent_id === node.id).length;

  // Compute IDs already linked to this node
  const linkedNodeIds = new Set(
    nodeLinks.map((l) => (l.a_id === node.id ? l.b_id : l.a_id))
  );

  // Nodes available to link (exclude self and already linked)
  const linkableNodes = allNodes.filter(
    (n) => n.id !== node.id && !linkedNodeIds.has(n.id)
  );

  // Current parent node
  const currentParent = node.parent_id
    ? allNodes.find((n) => n.id === node.parent_id) ?? null
    : null;

  const lastReviewed = node.last_reviewed_at;

  return (
    <div
      className={cn(
        "fixed right-0 top-16 bottom-0 w-80 bg-background border-l shadow-xl z-40",
        "flex flex-col overflow-hidden transition-transform duration-300"
      )}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-start justify-between gap-2 shrink-0"
        style={{ borderLeftColor: rootColor, borderLeftWidth: 3 }}
      >
        <div className="flex-1 min-w-0">
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-1">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => onJumpToNode(crumb.id)}
                  >
                    {crumb.title}
                  </button>
                </span>
              ))}
            </div>
          )}
          {isEditingTitle ? (
            <input
              className="font-semibold text-sm leading-tight w-full bg-transparent border-b border-primary outline-none"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              onBlur={handleConfirmRename}
              autoFocus
            />
          ) : (
            <h3
              className="font-semibold text-sm leading-tight cursor-text"
              onDoubleClick={() => {
                setEditingTitle(node.title);
                setIsEditingTitle(true);
              }}
              title="Double-click to rename"
            >
              {node.title}
            </h3>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="my" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full shrink-0 rounded-none border-b bg-transparent px-2 h-10 gap-0">
          <TabsTrigger value="my" className="flex-1 text-xs gap-1.5">
            <BookOpen className="h-3 w-3" /> My Learning
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1 text-xs gap-1.5">
            <Sparkles className="h-3 w-3" /> AI Insights
          </TabsTrigger>
        </TabsList>

        {/* My Learning tab */}
        <TabsContent value="my" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">

          {/* Node Type */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Node Type
            </span>
            <div className="flex flex-wrap gap-1">
              {NODE_TYPE_OPTIONS.map(({ type, label, icon: Icon }) => {
                const isActive = localNodeType === type;
                return (
                  <button
                    key={type}
                    onClick={() => handleNodeTypeSelect(type)}
                    disabled={nodeTypeSaving}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                      isActive
                        ? "text-white border-transparent"
                        : "text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                    )}
                    style={isActive ? { backgroundColor: rootColor, borderColor: rootColor } : undefined}
                  >
                    {Icon && <Icon className="h-2.5 w-2.5" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parent / Move */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Parent
            </span>
            <Popover open={movePickerOpen} onOpenChange={setMovePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs justify-start"
                  disabled={moveSaving}
                >
                  {moveSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  ) : (
                    <Move className="h-3 w-3 mr-1.5 text-muted-foreground" />
                  )}
                  <span className="truncate">
                    {currentParent ? currentParent.title : "Root topic"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" side="bottom" align="start">
                <Command>
                  <CommandInput placeholder="Search nodes…" className="h-8 text-xs" />
                  <CommandList className="max-h-52">
                    <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
                      No nodes found
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__make_root__"
                        onSelect={() => handleMoveNode(null)}
                        className="cursor-pointer"
                      >
                        <Home className="h-3 w-3 mr-2 text-muted-foreground" />
                        <span className="text-xs">Make root topic</span>
                      </CommandItem>
                      {movableNodes.map((n) => {
                        const crumb = buildBreadcrumb(n, allNodes);
                        const crumbText = crumb.map((c) => c.title).join(' › ');
                        return (
                          <CommandItem
                            key={n.id}
                            value={crumbText ? `${n.title} ${crumbText}` : n.title}
                            onSelect={() => handleMoveNode(n.id)}
                            className="flex flex-col items-start gap-0 py-1.5 cursor-pointer"
                          >
                            <span className="text-xs font-medium">{n.title}</span>
                            {crumbText && (
                              <span className="text-[10px] text-muted-foreground">{crumbText}</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Mastery */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mastery
              </span>
              {masterySaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            {/* Status segments */}
            <div className="flex rounded-md overflow-hidden border text-[10px] font-medium">
              {MASTERY_OPTIONS.map(({ status, label, color }) => {
                const isActive = localStatus === status;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={masterySaving}
                    className={cn(
                      "flex-1 py-1 px-0.5 text-center transition-colors",
                      isActive ? "text-white" : "text-muted-foreground hover:text-foreground"
                    )}
                    style={isActive ? { backgroundColor: color } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Confidence stars */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Confidence:</span>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleConfidenceChange(star)}
                  disabled={masterySaving}
                  className="transition-colors hover:scale-110"
                  title={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star
                    className="h-3.5 w-3.5"
                    style={{
                      fill: (localConfidence ?? 0) >= star ? rootColor : 'none',
                      stroke: (localConfidence ?? 0) >= star ? rootColor : '#94a3b8',
                    }}
                  />
                </button>
              ))}
            </div>

            {lastReviewed && (
              <p className="text-[10px] text-muted-foreground">
                Last reviewed: {formatRelativeTime(lastReviewed)}
              </p>
            )}
          </div>

          {/* Provenance */}
          {node.source && node.source !== 'manual' && (
            <ProvenanceBadge source={node.source} aiEvidence={node.ai_evidence ?? null} />
          )}

          {/* My Notes */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              My Notes
            </span>
            <Textarea
              placeholder="What I learned about this topic…"
              value={localNotes}
              onChange={(e) => { setLocalNotes(e.target.value); setNotesDirty(true); }}
              className="min-h-[100px] resize-none text-sm"
            />
            {notesDirty && (
              <Button size="sm" className="w-full" onClick={handleSaveNotes} disabled={notesSaving}>
                {notesSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                Save Notes
              </Button>
            )}
          </div>

          {/* My Takeaways */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              My Takeaways
            </span>
            {localUserFacts.length > 0 && (
              <ul className="space-y-1.5">
                {localUserFacts.map((fact, i) => (
                  <li key={i} className="flex items-start gap-2 group">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: rootColor }}
                    />
                    <span className="flex-1 text-sm leading-relaxed">{fact}</span>
                    <button
                      onClick={() => handlePromoteFact(i)}
                      disabled={factsSaving}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 mt-0.5 mr-1"
                      title="Promote to node"
                    >
                      <ArrowUpRight className="h-3 w-3 text-blue-500" />
                    </button>
                    <button
                      onClick={() => handleDeleteFact(i)}
                      disabled={factsSaving}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 mt-0.5"
                      title="Delete takeaway"
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-1.5">
              <Input
                placeholder="Add a takeaway…"
                value={addFact}
                onChange={(e) => setAddFact(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddFact()}
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={handleAddFact}
                disabled={factsSaving || !addFact.trim()}
              >
                {factsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Resources
            </span>

            {localResources.length > 0 && (
              <ul className="space-y-1.5">
                {localResources.map((res, i) => (
                  <li key={i} className="flex items-center gap-2 group">
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs text-primary hover:underline truncate"
                    >
                      {res.label || res.url}
                    </a>
                    <button
                      onClick={() => handleDeleteResource(i)}
                      disabled={resourcesSaving}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <Input
                placeholder="URL (https://…)"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddResource()}
                className="h-7 text-xs"
              />
              <Input
                placeholder="Label (optional)"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddResource()}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs"
                onClick={handleAddResource}
                disabled={resourcesSaving || !addUrl.trim()}
              >
                {resourcesSaving
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  : <Plus className="h-3 w-3 mr-1.5" />}
                Add Resource
              </Button>
            </div>
          </div>

          {/* Children */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Children
            </span>
            {showChildInput ? (
              <div className="flex gap-1.5">
                <Input
                  placeholder="Child node title…"
                  value={childInput}
                  onChange={(e) => setChildInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddChild();
                    if (e.key === "Escape") { setShowChildInput(false); setChildInput(""); }
                  }}
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={handleAddChild}
                  disabled={addingChild || !childInput.trim()}
                >
                  {addingChild ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
            ) : (
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setShowChildInput(true)}
              >
                <Plus className="h-3 w-3" />
                Add child
              </button>
            )}

            {/* Add sibling (only for non-root nodes) */}
            {node.parent_id && (
              showSiblingInput ? (
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Sibling node title…"
                    value={siblingInput}
                    onChange={(e) => setSiblingInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSibling();
                      if (e.key === "Escape") { setShowSiblingInput(false); setSiblingInput(""); }
                    }}
                    className="h-7 text-xs flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={handleAddSibling}
                    disabled={addingSibling || !siblingInput.trim()}
                  >
                    {addingSibling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  onClick={() => setShowSiblingInput(true)}
                >
                  <Plus className="h-3 w-3" />
                  Add sibling
                </button>
              )
            )}
            {/* Batch add */}
            {showBatchInput ? (
              <div className="space-y-1.5">
                <Textarea
                  placeholder={"Python, Data Structures\nAlgorithms\nSystem Design"}
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  rows={4}
                  className="text-xs resize-none"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs flex-1"
                    onClick={handleBatchAdd}
                    disabled={addingBatch || !batchInput.trim()}
                  >
                    {addingBatch ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                    Add All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => { setShowBatchInput(false); setBatchInput(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setShowBatchInput(true)}
              >
                <Plus className="h-3 w-3" />
                Batch add children
              </button>
            )}
          </div>

          <div className="border-t" />

          {/* Connections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Connections
              </span>
              {linkSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            {nodeLinks.length > 0 && (
              <ul className="space-y-1.5">
                {nodeLinks.map((link) => {
                  const linkedId = link.a_id === node.id ? link.b_id : link.a_id;
                  const linkedNode = allNodes.find((n) => n.id === linkedId);
                  if (!linkedNode) return null;
                  const crumb = buildBreadcrumb(linkedNode, allNodes);
                  const crumbText = crumb.map((c) => c.title).join(' › ');
                  return (
                    <li key={link.id} className="flex items-start gap-2 group">
                      <div className="flex-1 min-w-0">
                        <button
                          className="text-xs font-medium hover:underline text-left truncate w-full"
                          onClick={() => onJumpToNode(linkedId)}
                        >
                          {linkedNode.title}
                        </button>
                        {crumbText && (
                          <p className="text-[10px] text-muted-foreground truncate">{crumbText}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteLink(link.id)}
                        disabled={deletingLinkId === link.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 shrink-0 mt-0.5"
                      >
                        {deletingLinkId === link.id
                          ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          : <X className="h-3 w-3 text-red-500" />
                        }
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Popover open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  disabled={linkSaving || linkableNodes.length === 0}
                >
                  <Plus className="h-3 w-3 mr-1.5" />
                  Add connection
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" side="top" align="start">
                <Command>
                  <CommandInput placeholder="Search nodes…" className="h-8 text-xs" />
                  <CommandList className="max-h-48">
                    <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
                      No nodes found
                    </CommandEmpty>
                    <CommandGroup>
                      {linkableNodes.map((n) => {
                        const crumb = buildBreadcrumb(n, allNodes);
                        const crumbText = crumb.map((c) => c.title).join(' › ');
                        return (
                          <CommandItem
                            key={n.id}
                            value={n.title}
                            onSelect={() => handleAddLink(n.id)}
                            className="flex flex-col items-start gap-0 py-1.5 cursor-pointer"
                          >
                            <span className="text-xs font-medium">{n.title}</span>
                            {crumbText && (
                              <span className="text-[10px] text-muted-foreground">{crumbText}</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </TabsContent>

        {/* AI tab */}
        <TabsContent value="ai" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating AI summary…
            </div>
          )}

          {isGenerating && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Write your own summary (when no AI summary yet) */}
          {!detail && !isGenerating && !error && !isEditingDescription && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => { setEditDescription(""); setIsEditingDescription(true); }}
            >
              <Edit2 className="h-3 w-3" />
              Write your own summary
            </button>
          )}

          {isEditingDescription && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Summary
              </span>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="min-h-[100px] resize-none text-sm"
                placeholder="Write a summary for this node…"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveDescription} disabled={descriptionSaving}>
                  {descriptionSaving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditingDescription(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {detail && (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: rootColor }} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Summary
                  </span>
                  {!isEditingDescription && (
                    <button
                      className="ml-auto p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditDescription(detail.summary); setIsEditingDescription(true); }}
                      title="Edit summary"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isEditingDescription ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="min-h-[100px] resize-none text-sm"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveDescription} disabled={descriptionSaving}>
                        {descriptionSaving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditingDescription(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{detail.summary}</p>
                )}
              </div>

              {detail.key_facts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Key Facts
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {detail.key_facts.map((fact, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: rootColor }}
                        />
                        <span className="leading-relaxed">{fact}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="border-t" />

          {/* Find Gaps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ScanSearch className="h-3.5 w-3.5" style={{ color: rootColor }} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {childCount === 0 ? "Suggested Subtopics" : "Find Gaps"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                onClick={handleFindGaps}
                disabled={gapLoading}
              >
                {gapLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : childCount === 0 ? (
                  "Suggest"
                ) : (
                  "Analyze"
                )}
              </Button>
            </div>

            {gapLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing coverage…
              </div>
            )}

            {gapResult && (
              <div className="space-y-3">
                {gapResult.foundational.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">
                      Foundational
                    </p>
                    <ul className="space-y-1.5">
                      {gapResult.foundational.map((item, i) => {
                        const key = normalizeGapItem(item);
                        const added = addedGapItems.has(key);
                        return (
                          <li key={i} className="flex items-center justify-between gap-2">
                            <span className="text-xs flex-1">{item}</span>
                            <button
                              onClick={() => handleAddGapItem(item)}
                              disabled={added}
                              className={cn(
                                "shrink-0 h-5 w-5 rounded flex items-center justify-center transition-colors",
                                added
                                  ? "text-green-500"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )}
                              title={added ? "Added" : "Add to graph"}
                            >
                              {added ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {gapResult.advanced.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">
                      Advanced
                    </p>
                    <ul className="space-y-1.5">
                      {gapResult.advanced.map((item, i) => {
                        const key = normalizeGapItem(item);
                        const added = addedGapItems.has(key);
                        return (
                          <li key={i} className="flex items-center justify-between gap-2">
                            <span className="text-xs flex-1">{item}</span>
                            <button
                              onClick={() => handleAddGapItem(item)}
                              disabled={added}
                              className={cn(
                                "shrink-0 h-5 w-5 rounded flex items-center justify-center transition-colors",
                                added
                                  ? "text-green-500"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )}
                              title={added ? "Added" : "Add to graph"}
                            >
                              {added ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {gapResult.learning_path.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">
                      Learning Path
                    </p>
                    <ol className="space-y-1.5">
                      {gapResult.learning_path.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0 font-mono">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildBreadcrumb(
  node: KnowledgeNode | null,
  nodes: KnowledgeNode[]
): { id: string; title: string }[] {
  if (!node || !node.parent_id) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const chain: { id: string; title: string }[] = [];
  let cur = nodeById.get(node.parent_id);
  while (cur) {
    chain.unshift({ id: cur.id, title: cur.title });
    cur = cur.parent_id ? nodeById.get(cur.parent_id) : undefined;
  }
  return chain;
}
