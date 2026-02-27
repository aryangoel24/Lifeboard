"use client";

import { useEffect, useState, useCallback } from "react";
import { getNodeDetail, saveUserNotes, saveResources, saveUserFacts } from "@/lib/actions/knowledge";
import type { KnowledgeNode, NodeResource } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { X, ChevronRight, Loader2, Sparkles, BookOpen, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NodeDetailPanelProps {
  node: KnowledgeNode | null;
  nodes: KnowledgeNode[];
  onClose: () => void;
  onJumpToNode: (nodeId: string) => void;
  rootColor: string;
  onNotesChange: (nodeId: string, notes: string | null) => void;
  onResourcesChange: (nodeId: string, resources: NodeResource[]) => void;
  onUserFactsChange: (nodeId: string, facts: string[]) => void;
}

interface DetailState {
  summary: string;
  key_facts: string[];
}

export function NodeDetailPanel({
  node,
  nodes,
  onClose,
  onJumpToNode,
  rootColor,
  onNotesChange,
  onResourcesChange,
  onUserFactsChange,
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

  // Reset local user content when selected node changes
  useEffect(() => {
    if (!node) return;
    setLocalNotes(node.user_notes ?? "");
    setLocalResources(node.resources ?? []);
    setLocalUserFacts(node.user_facts ?? []);
    setNotesDirty(false);
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

  // Build breadcrumb
  const breadcrumb = buildBreadcrumb(node, nodes);

  if (!node) return null;

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
          <h3 className="font-semibold text-sm leading-tight">{node.title}</h3>
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
          {/* My Notes */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              My Notes
            </span>
            <Textarea
              placeholder="What I learned about this topic…"
              value={localNotes}
              onChange={(e) => { setLocalNotes(e.target.value); setNotesDirty(true); }}
              className="min-h-[120px] resize-none text-sm"
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
                      onClick={() => handleDeleteFact(i)}
                      disabled={factsSaving}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 mt-0.5"
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

          {detail && (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: rootColor }} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Summary
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{detail.summary}</p>
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
