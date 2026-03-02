"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Lightbulb,
  User,
  Book,
  Zap,
  FolderOpen,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { extractKnowledge, applyExtraction } from "@/lib/actions/extract";
import type { ExtractionResult, ExtractionNode, NodeType } from "@/types/database";
import type { ApprovedExtractionNode, ApprovedMatch, RootRouting } from "@/lib/actions/extract";
import type { LucideIcon } from "lucide-react";

type UIState = "input" | "loading" | "review";

const COURSE_EVIDENCE_KEYWORDS = ["syllabus", "assignment", "lecture", "readings", "course", "class", "module", "prerequisite"];

const NODE_TYPE_OPTIONS: { type: NodeType; label: string; icon: LucideIcon }[] = [
  { type: "topic", label: "Topic", icon: BookOpen },
  { type: "concept", label: "Concept", icon: Lightbulb },
  { type: "person", label: "Person", icon: User },
  { type: "book", label: "Book", icon: Book },
  { type: "skill", label: "Skill", icon: Zap },
  { type: "project", label: "Project", icon: FolderOpen },
  { type: "question", label: "Question", icon: HelpCircle },
  { type: "insight", label: "Insight", icon: Sparkles },
];

function getNextNodeType(current: NodeType): NodeType {
  const types = NODE_TYPE_OPTIONS.map((o) => o.type);
  const idx = types.indexOf(current);
  return types[(idx + 1) % types.length];
}

function NodeTypeIcon({ type, className }: { type: NodeType; className?: string }) {
  const option = NODE_TYPE_OPTIONS.find((o) => o.type === type);
  if (!option) return null;
  const Icon = option.icon;
  return <Icon className={className ?? "h-3 w-3"} />;
}

// Flatten ExtractionNode tree into a flat list for easy access
type FlatNode = {
  temp_id: string;
  title: string;
  node_type: NodeType;
  evidence: string;
  parentTempId: string | null;
  level: number;
};

function flattenTree(roots: ExtractionNode[]): FlatNode[] {
  const result: FlatNode[] = [];

  function visit(node: ExtractionNode, parentTempId: string | null, level: number) {
    result.push({
      temp_id: node.temp_id,
      title: typeof node.title === "string" ? node.title : String(node.title ?? ""),
      node_type: typeof node.node_type === "string" ? node.node_type as NodeType : "topic",
      evidence: typeof node.evidence === "string" ? node.evidence : "",
      parentTempId,
      level,
    });
    for (const child of node.children ?? []) {
      if (child && typeof child === "object" && "temp_id" in child) {
        visit(child, node.temp_id, level + 1);
      }
    }
  }

  for (const root of roots) {
    visit(root, null, 0);
  }
  return result;
}

export function ExtractClient() {
  const router = useRouter();
  const [uiState, setUiState] = useState<UIState>("input");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [extractionId] = useState(() => crypto.randomUUID());

  // Per-node checked state: temp_id → boolean
  const [checkedNodes, setCheckedNodes] = useState<Record<string, boolean>>({});
  // Per-node type overrides: temp_id → NodeType
  const [nodeTypes, setNodeTypes] = useState<Record<string, NodeType>>({});
  // Collapsed roots: Set of root temp_ids
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());

  // Per-match checked state: matched_node_id → boolean
  const [checkedMatches, setCheckedMatches] = useState<Record<string, boolean>>({});
  // Per-match per-fact checked state: `${matched_node_id}::${index}` → boolean
  const [checkedFacts, setCheckedFacts] = useState<Record<string, boolean>>({});

  // Root routing: "new" = create under Inbox; any other string = targetNodeId for merge
  const [allExistingNodes, setAllExistingNodes] = useState<{ id: string; title: string; breadcrumb: string }[]>([]);
  const [rootRouting, setRootRouting] = useState<Record<string, "new" | string>>({});
  const [autoMatchedRoots, setAutoMatchedRoots] = useState<Set<string>>(new Set());

  const [applying, setApplying] = useState(false);

  const handleExtract = useCallback(async () => {
    if (!text.trim()) {
      toast.error("Please paste some text first");
      return;
    }
    setUiState("loading");
    const res = await extractKnowledge(text);
    if ("error" in res) {
      toast.error(res.error);
      setUiState("input");
      return;
    }

    setResult(res.result);
    setAllExistingNodes(res.allNodes);

    // Build routing: default everyone to "new", then override with high-confidence auto-matches
    const autoRouting: Record<string, "new" | string> = {};
    const autoIds = new Set<string>();
    for (const r of res.result.roots) {
      autoRouting[r.temp_id] = "new";
    }
    for (const m of res.result.matches) {
      if (!m.temp_id) continue;
      const hasStrongEvidence = COURSE_EVIDENCE_KEYWORDS.some((k) =>
        (m.evidence ?? "").toLowerCase().includes(k)
      );
      if (m.confidence >= 0.85 || (m.confidence >= 0.8 && hasStrongEvidence)) {
        autoRouting[m.temp_id] = m.matched_node_id;
        autoIds.add(m.temp_id);
      }
    }
    setRootRouting(autoRouting);
    setAutoMatchedRoots(autoIds);

    // Pre-check all nodes by default
    const flat = flattenTree(res.result.roots);
    const initialChecked: Record<string, boolean> = {};
    for (const n of flat) initialChecked[n.temp_id] = true;
    setCheckedNodes(initialChecked);

    // Pre-check matches with confidence >= 0.65
    const initialMatches: Record<string, boolean> = {};
    const initialFacts: Record<string, boolean> = {};
    for (const m of res.result.matches) {
      initialMatches[m.matched_node_id] = m.confidence >= 0.65;
      for (let i = 0; i < (m.add_facts ?? []).length; i++) {
        initialFacts[`${m.matched_node_id}::${i}`] = m.confidence >= 0.65;
      }
    }
    setCheckedMatches(initialMatches);
    setCheckedFacts(initialFacts);

    setUiState("review");
  }, [text]);

  const handleApply = useCallback(async () => {
    if (!result) return;

    const flat = flattenTree(result.roots);
    const approved: ApprovedExtractionNode[] = flat
      .filter((n) => checkedNodes[n.temp_id])
      .map((n) => ({
        temp_id: n.temp_id,
        title: n.title,
        nodeType: nodeTypes[n.temp_id] ?? n.node_type,
        parentTempId: n.parentTempId,
        evidence: n.evidence,
      }));

    // Filter: only include nodes whose ancestors are also checked
    const checkedSet = new Set(approved.map((n) => n.temp_id));
    const filteredApproved = approved.filter((n) => {
      if (n.parentTempId === null) return true;
      return checkedSet.has(n.parentTempId);
    });

    const approvedMatches: ApprovedMatch[] = result.matches
      .filter((m) => checkedMatches[m.matched_node_id])
      .map((m) => ({
        matched_node_id: m.matched_node_id,
        add_facts: (m.add_facts ?? []).filter(
          (_, i) => checkedFacts[`${m.matched_node_id}::${i}`]
        ),
      }));

    const routing: RootRouting = {};
    for (const [tempId, val] of Object.entries(rootRouting)) {
      routing[tempId] =
        val === "new" || !val
          ? { mode: "new" }
          : { mode: "merge", targetNodeId: val };
    }

    setApplying(true);
    const res = await applyExtraction(extractionId, filteredApproved, approvedMatches, routing);
    setApplying(false);

    if (res && "error" in res) {
      toast.error(res.error);
      return;
    }

    const nodeCount = filteredApproved.length;
    const matchCount = approvedMatches.filter((m) => m.add_facts.length > 0).length;
    toast.success(
      `Applied ${nodeCount} node${nodeCount !== 1 ? "s" : ""}` +
      (matchCount > 0 ? ` and updated ${matchCount} existing node${matchCount !== 1 ? "s" : ""}` : "")
    );
    router.push("/learn/hub");
  }, [result, checkedNodes, nodeTypes, checkedMatches, checkedFacts, rootRouting, extractionId, router]);

  function toggleRootCollapse(tempId: string) {
    setCollapsedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  function selectAllUnderRoot(rootTempId: string, flat: FlatNode[], checked: boolean) {
    const underRoot = getSubtreeIds(rootTempId, flat);
    setCheckedNodes((prev) => {
      const next = { ...prev };
      for (const id of underRoot) next[id] = checked;
      return next;
    });
  }

  function getSubtreeIds(tempId: string, flat: FlatNode[]): string[] {
    const result: string[] = [tempId];
    const children = flat.filter((n) => n.parentTempId === tempId);
    for (const c of children) {
      result.push(...getSubtreeIds(c.temp_id, flat));
    }
    return result;
  }

  if (uiState === "input") {
    return (
      <div className="container mx-auto max-w-2xl py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Brain Dump Extraction</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste any freeform text — a resume, journal, course notes, or life summary — and AI will extract
            a structured knowledge tree.
          </p>
        </div>

        <Textarea
          placeholder="Paste any text — resume, life notes, course material, anything..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="resize-none font-mono text-sm"
        />

        <Button onClick={handleExtract} disabled={!text.trim()} className="w-full">
          Extract Knowledge Structure
        </Button>
      </div>
    );
  }

  if (uiState === "loading") {
    return (
      <div className="container mx-auto max-w-2xl py-8 px-4 flex flex-col items-center justify-center gap-4 min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Extracting knowledge structure...</p>
      </div>
    );
  }

  // Review state
  if (!result) return null;

  const flat = flattenTree(result.roots);
  const rootNodes = flat.filter((n) => n.level === 0);

  const totalSelected = flat.filter((n) => checkedNodes[n.temp_id]).length;
  const matchesSelected = result.matches.filter((m) => checkedMatches[m.matched_node_id]).length;

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review Extracted Knowledge</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select the nodes and updates you want to apply to your knowledge graph.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        {result.summary}
      </div>

      {/* New nodes section */}
      {rootNodes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            New Nodes
          </h2>
          <div className="space-y-1">
            {rootNodes.map((root) => {
              const isCollapsed = collapsedRoots.has(root.temp_id);
              const subtreeNodes = flat.filter(
                (n) => n.temp_id !== root.temp_id && getSubtreeIds(root.temp_id, flat).includes(n.temp_id)
              );
              const allChecked = [root, ...subtreeNodes].every((n) => checkedNodes[n.temp_id]);

              return (
                <div key={root.temp_id} className="rounded-lg border">
                  {/* Root row */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 rounded-t-lg">
                    <Checkbox
                      checked={checkedNodes[root.temp_id] ?? false}
                      onCheckedChange={(v) => {
                        setCheckedNodes((prev) => ({ ...prev, [root.temp_id]: !!v }));
                      }}
                    />
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggleRootCollapse(root.temp_id)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="flex items-center gap-1.5"
                      onClick={() => {
                        const next = getNextNodeType(nodeTypes[root.temp_id] ?? root.node_type);
                        setNodeTypes((prev) => ({ ...prev, [root.temp_id]: next }));
                      }}
                    >
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex items-center gap-1 cursor-pointer">
                        <NodeTypeIcon type={nodeTypes[root.temp_id] ?? root.node_type} className="h-2.5 w-2.5" />
                        {nodeTypes[root.temp_id] ?? root.node_type}
                      </Badge>
                    </button>
                    <span className="text-sm font-medium flex-1">{root.title}</span>
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => selectAllUnderRoot(root.temp_id, flat, !allChecked)}
                    >
                      {allChecked ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  {root.evidence && (
                    <div className="px-3 pb-1 pt-0">
                      <p className="text-[10px] text-muted-foreground truncate italic">&ldquo;{root.evidence}&rdquo;</p>
                    </div>
                  )}

                  {/* Routing toggle */}
                  {allExistingNodes.length > 0 && (
                    <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${rootRouting[root.temp_id] === "new"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground border-border hover:border-foreground/30"
                          }`}
                        onClick={() => {
                          setRootRouting((prev) => ({ ...prev, [root.temp_id]: "new" }));
                          setAutoMatchedRoots((prev) => {
                            const next = new Set(prev);
                            next.delete(root.temp_id);
                            return next;
                          });
                        }}
                      >
                        New node
                      </button>
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${rootRouting[root.temp_id] !== "new"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground border-border hover:border-foreground/30"
                          }`}
                        onClick={() => {
                          if (rootRouting[root.temp_id] === "new") {
                            setRootRouting((prev) => ({
                              ...prev,
                              [root.temp_id]: allExistingNodes[0]?.id ?? "new",
                            }));
                          }
                        }}
                      >
                        Merge into →
                      </button>
                      {autoMatchedRoots.has(root.temp_id) && rootRouting[root.temp_id] !== "new" && (
                        <span className="text-[10px] text-emerald-600 font-medium">Auto-matched</span>
                      )}
                      {rootRouting[root.temp_id] !== "new" && (
                        <select
                          className="text-[10px] border rounded px-1 py-0.5 bg-background text-foreground max-w-[200px]"
                          value={rootRouting[root.temp_id]}
                          onChange={(e) =>
                            setRootRouting((prev) => ({ ...prev, [root.temp_id]: e.target.value }))
                          }
                        >
                          {allExistingNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.breadcrumb}
                            </option>
                          ))}
                        </select>
                      )}
                      {(() => {
                        if (rootRouting[root.temp_id] !== "new") return null;
                        const nearMatch = result.matches.find(
                          (m) => m.temp_id === root.temp_id && m.confidence >= 0.75 && m.confidence < 0.85
                        );
                        if (!nearMatch) return null;
                        const breadcrumb = allExistingNodes.find((n) => n.id === nearMatch.matched_node_id)?.breadcrumb;
                        if (!breadcrumb) return null;
                        return (
                          <button
                            className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline transition-colors ml-1"
                            onClick={() =>
                              setRootRouting((prev) => ({ ...prev, [root.temp_id]: nearMatch.matched_node_id }))
                            }
                          >
                            Possible match: {breadcrumb} ({Math.round(nearMatch.confidence * 100)}%)
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  {/* Children and grandchildren */}
                  {!isCollapsed && (
                    <div className="divide-y">
                      {flat
                        .filter(
                          (n) =>
                            n.parentTempId === root.temp_id ||
                            flat.some(
                              (c) => c.parentTempId === root.temp_id && n.parentTempId === c.temp_id
                            )
                        )
                        .map((n) => (
                          <div
                            key={n.temp_id}
                            className="flex flex-col px-3 py-2"
                            style={{ paddingLeft: n.level === 1 ? "1.5rem" : "3rem" }}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checkedNodes[n.temp_id] ?? false}
                                onCheckedChange={(v) => {
                                  setCheckedNodes((prev) => ({ ...prev, [n.temp_id]: !!v }));
                                }}
                              />
                              <button
                                className="flex items-center gap-1.5"
                                onClick={() => {
                                  const next = getNextNodeType(nodeTypes[n.temp_id] ?? n.node_type);
                                  setNodeTypes((prev) => ({ ...prev, [n.temp_id]: next }));
                                }}
                              >
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex items-center gap-1 cursor-pointer">
                                  <NodeTypeIcon type={nodeTypes[n.temp_id] ?? n.node_type} className="h-2.5 w-2.5" />
                                  {nodeTypes[n.temp_id] ?? n.node_type}
                                </Badge>
                              </button>
                              <span className="text-sm">{n.title}</span>
                            </div>
                            {n.evidence && (
                              <p className="text-[10px] text-muted-foreground truncate italic mt-0.5 ml-7">
                                &ldquo;{n.evidence}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Existing node matches */}
      {result.matches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            These look like nodes you already have — update instead of duplicate
          </h2>
          <div className="space-y-2">
            {result.matches.map((match) => (
              <div key={match.matched_node_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={checkedMatches[match.matched_node_id] ?? false}
                    onCheckedChange={(v) => {
                      setCheckedMatches((prev) => ({
                        ...prev,
                        [match.matched_node_id]: !!v,
                      }));
                      // Keep routing in sync: if this match targets a root node,
                      // checking it should route that root to merge (not create under Inbox)
                      if (match.temp_id) {
                        const isRoot = result.roots.some((r) => r.temp_id === match.temp_id);
                        if (isRoot) {
                          setRootRouting((prev) => ({
                            ...prev,
                            [match.temp_id]: v ? match.matched_node_id : "new",
                          }));
                        }
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{match.proposed_title}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{match.matched_node_title}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 ${match.confidence >= 0.8
                            ? "bg-emerald-500/10 text-emerald-700"
                            : match.confidence >= 0.65
                              ? "bg-yellow-500/10 text-yellow-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {Math.round(match.confidence * 100)}% match
                      </Badge>
                    </div>
                    {match.evidence && (
                      <p className="text-[10px] text-muted-foreground italic mt-1 truncate">
                        &ldquo;{match.evidence}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Per-fact checkboxes */}
                {(match.add_facts ?? []).length > 0 && (
                  <div className="ml-6 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                      Add facts:
                    </p>
                    {(match.add_facts ?? []).map((fact, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Checkbox
                          checked={checkedFacts[`${match.matched_node_id}::${i}`] ?? false}
                          onCheckedChange={(v) => {
                            setCheckedFacts((prev) => ({
                              ...prev,
                              [`${match.matched_node_id}::${i}`]: !!v,
                            }));
                          }}
                        />
                        <span className="text-xs">{fact}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t">
        <p className="text-sm text-muted-foreground">
          {totalSelected} node{totalSelected !== 1 ? "s" : ""} selected
          {matchesSelected > 0 && ` · ${matchesSelected} existing update${matchesSelected !== 1 ? "s" : ""}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setUiState("input")}>
            Back
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || (totalSelected === 0 && matchesSelected === 0)}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
