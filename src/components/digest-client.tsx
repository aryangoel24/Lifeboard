"use client";

import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { analyzeDigest, saveDigestOnly, applyDigestUpdates } from "@/lib/actions/digest";
import type { DigestPayload, NodeType } from "@/types/database";
import type { DigestHistoryItem } from "@/lib/actions/digest";

type UIState = "entry" | "analyzing" | "review";

const NODE_TYPES: NodeType[] = [
  "topic", "concept", "skill", "book", "person", "project", "question", "insight",
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function _confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (confidence >= 0.65) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (confidence >= 0.65) return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  return "bg-red-500/10 text-red-700 dark:text-red-300";
}

function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-700",
    applied: "bg-emerald-500/10 text-emerald-700",
    dismissed: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

interface DigestClientProps {
  recentDigests: DigestHistoryItem[];
}

export function DigestClient({ recentDigests: initialDigests }: DigestClientProps) {
  const [uiState, setUiState] = useState<UIState>("entry");
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");

  // Review state
  const [digestId, setDigestId] = useState<string | null>(null);
  const [payload, setPayload] = useState<DigestPayload | null>(null);
  const [nodeTitles, setNodeTitles] = useState<Record<string, string>>({});
  const [approvedTakeaways, setApprovedTakeaways] = useState<Set<string>>(new Set());
  const [approvedNewNodes, setApprovedNewNodes] = useState<Set<string>>(new Set());
  const [editedNodeTypes, setEditedNodeTypes] = useState<Record<string, NodeType>>({});
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [recentDigests, setRecentDigests] = useState<DigestHistoryItem[]>(initialDigests);

  // Pre-compute all possible takeaway keys for "apply all"
  const allTakeawayKeys = useMemo(() => {
    if (!payload) return new Set<string>();
    const keys = new Set<string>();
    for (const u of payload.node_updates) {
      u.add_takeaways.forEach((_, i) => keys.add(`${u.node_id}::${i}`));
    }
    return keys;
  }, [payload]);

  const allNewNodeKeys = useMemo(() => {
    if (!payload) return new Set<string>();
    return new Set(payload.new_nodes.map((n) => n.temp_id));
  }, [payload]);

  function initReviewState(p: DigestPayload) {
    const takeaways = new Set<string>();
    for (const u of p.node_updates) {
      if (u.confidence >= 0.65) {
        u.add_takeaways.forEach((_, i) => takeaways.add(`${u.node_id}::${i}`));
      }
    }
    const newNodes = new Set(p.new_nodes.map((n) => n.temp_id));
    setApprovedTakeaways(takeaways);
    setApprovedNewNodes(newNodes);
    setEditedNodeTypes({});
    setUnassignedOpen(false);
  }

  async function handleAnalyze() {
    if (!text.trim()) {
      toast.error("Please write something before analyzing.");
      return;
    }
    setUiState("analyzing");
    const result = await analyzeDigest(text.trim(), date);
    if ("error" in result) {
      toast.error(result.error);
      setUiState("entry");
      return;
    }
    setDigestId(result.digestId);
    setPayload(result.payload);
    setNodeTitles(result.nodeTitles);
    initReviewState(result.payload);
    setUiState("review");
  }

  async function handleSaveOnly() {
    if (!text.trim()) {
      toast.error("Please write something before saving.");
      return;
    }
    const result = await saveDigestOnly(text.trim(), date);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Journal saved.");
    // Refresh recent digests by updating locally
    setRecentDigests((prev) => {
      const filtered = prev.filter((d) => d.date !== date);
      return [{ id: "tmp", date, summary: null, suggestion_status: null }, ...filtered].slice(0, 10);
    });
  }

  function handleDiscard() {
    setUiState("entry");
    setPayload(null);
    setDigestId(null);
  }

  async function handleApplySelected() {
    if (!digestId || !payload) return;

    const updates: Parameters<typeof applyDigestUpdates>[1] = [];

    for (const u of payload.node_updates) {
      const approvedTakeawayList = u.add_takeaways.filter((_, i) =>
        approvedTakeaways.has(`${u.node_id}::${i}`)
      );
      if (approvedTakeawayList.length > 0) {
        updates.push({ type: "node_update", nodeId: u.node_id, takeaways: approvedTakeawayList });
      }
    }

    for (const n of payload.new_nodes) {
      if (approvedNewNodes.has(n.temp_id)) {
        updates.push({
          type: "new_node",
          temp_id: n.temp_id,
          title: n.proposed_title,
          parentId: n.suggested_parent_node_id,
          nodeType: editedNodeTypes[n.temp_id] ?? n.node_type,
        });
      }
    }

    if (updates.length === 0) {
      toast.info("Nothing selected to apply.");
      return;
    }

    const result = await applyDigestUpdates(digestId, updates);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Applied ${updates.length} update${updates.length !== 1 ? "s" : ""} to your knowledge graph.`);
    setUiState("entry");
    setPayload(null);
    setDigestId(null);
  }

  async function handleApplyAll() {
    if (!payload) return;
    setApprovedTakeaways(new Set(allTakeawayKeys));
    setApprovedNewNodes(new Set(allNewNodeKeys));
    // Apply after state update — we compute inline here
    if (!digestId) return;

    const updates: Parameters<typeof applyDigestUpdates>[1] = [];

    for (const u of payload.node_updates) {
      if (u.add_takeaways.length > 0) {
        updates.push({ type: "node_update", nodeId: u.node_id, takeaways: u.add_takeaways });
      }
    }

    for (const n of payload.new_nodes) {
      updates.push({
        type: "new_node",
        temp_id: n.temp_id,
        title: n.proposed_title,
        parentId: n.suggested_parent_node_id,
        nodeType: editedNodeTypes[n.temp_id] ?? n.node_type,
      });
    }

    if (updates.length === 0) {
      toast.info("Nothing to apply.");
      return;
    }

    const result = await applyDigestUpdates(digestId, updates);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Applied all ${updates.length} update${updates.length !== 1 ? "s" : ""} to your knowledge graph.`);
    setUiState("entry");
    setPayload(null);
    setDigestId(null);
  }

  const toggleTakeaway = useCallback((key: string) => {
    setApprovedTakeaways((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleNewNode = useCallback((tempId: string) => {
    setApprovedNewNodes((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }, []);

  // ── Entry UI ──────────────────────────────────────────────────────────────
  if (uiState === "entry") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
        <div>
          <h1 className="text-2xl font-bold">Daily Digest</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Write freely — AI maps your notes to your knowledge graph.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground w-10">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm border rounded-md px-2 py-1 bg-background text-foreground"
            />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you learn, do, or think about today?"
            className="min-h-[200px] resize-y"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleSaveOnly} disabled={!text.trim()}>
              Save only
            </Button>
            <Button onClick={handleAnalyze} disabled={!text.trim()}>
              Analyze
            </Button>
          </div>
        </div>

        {recentDigests.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Recent
            </h2>
            <div className="space-y-1">
              {recentDigests.map((d) => (
                <div
                  key={d.id}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground font-mono text-xs pt-0.5 w-24 shrink-0">
                    {d.date}
                  </span>
                  <span className="flex-1 line-clamp-1 text-muted-foreground">
                    {d.summary ?? "Saved, not analyzed"}
                  </span>
                  <span className="shrink-0">{statusBadge(d.suggestion_status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Analyzing UI ──────────────────────────────────────────────────────────
  if (uiState === "analyzing") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Analyzing your journal entry…</p>
      </div>
    );
  }

  // ── Review UI ─────────────────────────────────────────────────────────────
  if (!payload) return null;

  const selectedCount =
    Array.from(approvedTakeaways).length + Array.from(approvedNewNodes).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Approve what should be added to your knowledge graph.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Summary</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{payload.summary}</p>
        {payload.highlights.length > 0 && (
          <ul className="space-y-1">
            {payload.highlights.map((h, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Node updates */}
      {payload.node_updates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            Updates to existing nodes{" "}
            <span className="text-muted-foreground font-normal">
              ({payload.node_updates.length})
            </span>
          </h2>
          <div className="space-y-2">
            {payload.node_updates.map((u) => {
              const title = nodeTitles[u.node_id] ?? u.node_id;
              const pct = Math.round(u.confidence * 100);
              return (
                <div key={u.node_id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidenceBg(u.confidence)}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {u.add_takeaways.map((takeaway, i) => {
                      const key = `${u.node_id}::${i}`;
                      return (
                        <label
                          key={key}
                          className="flex items-start gap-2 cursor-pointer group"
                        >
                          <Checkbox
                            checked={approvedTakeaways.has(key)}
                            onCheckedChange={() => toggleTakeaway(key)}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                            {takeaway}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New nodes */}
      {payload.new_nodes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            New nodes suggested{" "}
            <span className="text-muted-foreground font-normal">({payload.new_nodes.length})</span>
          </h2>
          <div className="space-y-2">
            {payload.new_nodes.map((n) => {
              const parentTitle = nodeTitles[n.suggested_parent_node_id] ?? "Inbox";
              const checked = approvedNewNodes.has(n.temp_id);
              return (
                <div key={n.temp_id} className="rounded-lg border bg-card p-3 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleNewNode(n.temp_id)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="font-medium text-sm">{n.proposed_title}</span>
                  </label>
                  <div className="pl-6 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">Parent:</span>
                      <span className="text-xs font-medium">{parentTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <Select
                        value={editedNodeTypes[n.temp_id] ?? n.node_type}
                        onValueChange={(v) =>
                          setEditedNodeTypes((prev) => ({ ...prev, [n.temp_id]: v as NodeType }))
                        }
                      >
                        <SelectTrigger className="h-6 text-xs px-2 w-auto min-w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NODE_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground italic">{n.why}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unassigned (collapsed by default) */}
      {payload.unassigned.length > 0 && (
        <div className="rounded-lg border">
          <button
            onClick={() => setUnassignedOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {unassignedOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            Unassigned ({payload.unassigned.length})
          </button>
          {unassignedOpen && (
            <div className="px-3 pb-3 space-y-2">
              <Separator />
              {payload.unassigned.map((u, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-sm">{u.text}</p>
                  <p className="text-xs text-muted-foreground italic">{u.why_unmatched}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 justify-between pt-2">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleDiscard}>
            Discard
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleApplySelected} disabled={selectedCount === 0}>
            Apply Selected
            {selectedCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
                {selectedCount}
              </Badge>
            )}
          </Button>
          <Button size="sm" onClick={handleApplyAll}>
            Apply All
          </Button>
        </div>
      </div>
    </div>
  );
}
