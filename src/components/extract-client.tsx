"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { extractKnowledgeFromSource, applyExtraction } from "@/lib/actions/extract";
import type { ExtractionSourcePayload } from "@/lib/actions/extract";
import type { ExtractionResult, ExtractionNode, NodeType } from "@/types/database";
import type { ApprovedExtractionNode, ApprovedMatch, RootRouting } from "@/lib/actions/extract";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

type UIState = "input" | "loading" | "review";
type InputTab = "text" | "link" | "pdf" | "voice";

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
  facts: string[];
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
      facts: Array.isArray(node.facts) ? node.facts : [],
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

  // Input states
  const [activeTab, setActiveTab] = useState<InputTab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();

  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [sourceMeta, setSourceMeta] = useState<{ source: string; source_ref: string; title?: string; siteName?: string } | null>(null);
  const [extractionId] = useState(() => crypto.randomUUID());

  // Per-node checked state: temp_id → boolean
  const [checkedNodes, setCheckedNodes] = useState<Record<string, boolean>>({});
  // Per-node per-fact checked state: `${temp_id}::${index}` → boolean
  const [checkedNodeFacts, setCheckedNodeFacts] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Attach duration to the blob object for the UI to display after stopping
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (blob as any).duration = recordingTime;
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleExtract = useCallback(async () => {
    let payload: ExtractionSourcePayload;

    if (activeTab === "text") {
      if (!text.trim()) {
        toast.error("Please paste some text first");
        return;
      }
      payload = { kind: "text", text };
    } else if (activeTab === "link") {
      if (!url.trim() || !url.startsWith("http")) {
        toast.error("Please enter a valid HTTP/HTTPS URL");
        return;
      }
      payload = { kind: "url", url };
    } else if (activeTab === "pdf") {
      if (!pdfFile) {
        toast.error("Please upload a PDF file first");
        return;
      }
      if (pdfFile.size > 10 * 1024 * 1024) {
        toast.error("File is too large (max 10MB)");
        return;
      }
      const formData = new FormData();
      formData.append("file", pdfFile);
      payload = { kind: "pdf", formData };
    } else if (activeTab === "voice") {
      if (!audioBlob) {
        toast.error("Please record a voice memo first");
        return;
      }
      const formData = new FormData();
      const filename = `recording_${new Date().getTime()}.webm`;
      formData.append("file", audioBlob, filename);
      payload = { kind: "voice", formData };
    } else {
      toast.error("This input method is not implemented yet.");
      return;
    }

    setUiState("loading");
    const res = await extractKnowledgeFromSource(payload);
    if ("error" in res) {
      toast.error(res.error);
      setUiState("input");
      return;
    }

    setResult(res.result);
    setSourceMeta(res.sourceMeta);
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

    // Pre-check UX defaults
    const flat = flattenTree(res.result.roots);
    const initialChecked: Record<string, boolean> = {};
    const initialNodeFacts: Record<string, boolean> = {};

    for (const n of flat) {
      const isRootMerge = n.parentTempId === null && autoRouting[n.temp_id] !== "new" && !!autoRouting[n.temp_id];
      const hasChildren = flat.some(c => c.parentTempId === n.temp_id);
      const isArtifact = ["person", "book", "project"].includes(n.node_type);

      // New nodes ⛔ unchecked unless one of these conditions is met
      if (isArtifact || hasChildren || isRootMerge) {
        initialChecked[n.temp_id] = true;
      } else {
        initialChecked[n.temp_id] = false;
      }

      // Facts ✅ checked by default
      for (let i = 0; i < n.facts.length; i++) {
        initialNodeFacts[`${n.temp_id}::${i}`] = true;
      }
    }
    setCheckedNodes(initialChecked);
    setCheckedNodeFacts(initialNodeFacts);

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
  }, [activeTab, text, url, pdfFile, audioBlob]);

  const handleApply = useCallback(async () => {
    if (!result) return;

    const flat = flattenTree(result.roots);
    // First, map every node to its nearest CHECKED ancestor
    const nearestCheckedParent = new Map<string, string | null>();
    for (const n of flat) {
      if (checkedNodes[n.temp_id]) continue; // We only care about finding parents for unchecked nodes

      let parent = n.parentTempId;
      while (parent !== null && !checkedNodes[parent]) {
        const parentNode = flat.find(p => p.temp_id === parent);
        parent = parentNode ? parentNode.parentTempId : null;
      }
      nearestCheckedParent.set(n.temp_id, parent);
    }

    // Accumulate facts from unchecked nodes
    const hoistedFacts = new Map<string, string[]>();
    for (const n of flat) {
      if (checkedNodes[n.temp_id]) continue;

      const targetParent = nearestCheckedParent.get(n.temp_id);
      if (!targetParent) continue; // If there is no checked ancestor, facts are dropped

      const checkedFactsHere = n.facts.filter((_, i) => checkedNodeFacts[`${n.temp_id}::${i}`]);
      if (checkedFactsHere.length > 0) {
        if (!hoistedFacts.has(targetParent)) hoistedFacts.set(targetParent, []);
        hoistedFacts.get(targetParent)!.push(...checkedFactsHere);
      }
    }

    const approved: ApprovedExtractionNode[] = flat
      .filter((n) => checkedNodes[n.temp_id])
      .map((n) => ({
        temp_id: n.temp_id,
        title: n.title,
        nodeType: nodeTypes[n.temp_id] ?? n.node_type,
        parentTempId: n.parentTempId,
        evidence: n.evidence,
        facts: [
          ...n.facts.filter((_, i) => checkedNodeFacts[`${n.temp_id}::${i}`]),
          ...(hoistedFacts.get(n.temp_id) || [])
        ],
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
  }, [result, checkedNodes, nodeTypes, checkedMatches, checkedFacts, checkedNodeFacts, rootRouting, extractionId, router]);

  function toggleRootCollapse(tempId: string) {
    setCollapsedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  function handlePromoteFact(parentTempId: string, factIndex: number) {
    setResult((prev) => {
      if (!prev) return prev;

      let promotedFactText = "";
      const newId = `promoted_${Date.now()}`;

      const mutateTree = (nodes: ExtractionNode[]): ExtractionNode[] => {
        return nodes.map((n) => {
          if (n.temp_id === parentTempId) {
            const newFacts = [...(n.facts || [])];
            promotedFactText = newFacts[factIndex];
            newFacts.splice(factIndex, 1);

            // Rehydrate fact format if it was demoted
            let title = "Promoted Concept";
            let evidence = promotedFactText;
            const match = promotedFactText.match(/^\\[demoted-node\\]\\s*(.*?) —\\s*(.*)$/);
            if (match) {
              title = match[1].trim();
              evidence = match[2].trim();
            } else {
              title = promotedFactText.slice(0, 30);
            }

            const newChild: ExtractionNode = {
              temp_id: newId,
              title,
              node_type: "concept",
              evidence,
              facts: [],
              children: []
            };

            return {
              ...n,
              facts: newFacts,
              children: [...(n.children || []), newChild]
            };
          }
          if (n.children) {
            return { ...n, children: mutateTree(n.children) };
          }
          return n;
        });
      };

      const newRoots = mutateTree(prev.roots);

      if (promotedFactText) {
        setCheckedNodes((c) => ({ ...c, [newId]: true }));
        setCheckedNodeFacts((c) => ({ ...c, [`${parentTempId}::${factIndex}`]: false }));
      }

      return { ...prev, roots: newRoots };
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
          <h1 className="text-2xl font-bold">Add to Knowledge Graph</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Extract knowledge from any source and integrate it directly into your personal graph.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InputTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="text">Paste Text</TabsTrigger>
            <TabsTrigger value="link">Web Link</TabsTrigger>
            <TabsTrigger value="pdf">PDF</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
          </TabsList>

          <div className="mt-4 border rounded-md p-4 bg-card">
            <TabsContent value="text" className="mt-0">
              <Textarea
                placeholder="Paste any freeform text — notes, syllabus, resume..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                className="resize-none font-mono text-sm border-0 focus-visible:ring-0 p-0"
              />
            </TabsContent>

            <TabsContent value="link" className="mt-0 space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Article or Page URL</label>
                <Input
                  type="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url) handleExtract();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  The AI will automatically fetch the article text and extract its core concepts.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="pdf" className="mt-0 space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload PDF Document</label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPdfFile(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Upload lecture slides or research papers. Scanned images without text are not supported.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="voice" className="mt-0 space-y-4 py-8 flex flex-col items-center justify-center">
              <div className="text-center space-y-2 mb-4">
                <h3 className="font-medium text-lg">Brain Dump Audio</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Record a quick voice memo explaining what you learned today. AI will transcribe and map it into your graph.
                </p>
              </div>

              {!audioBlob ? (
                <Button
                  size="lg"
                  variant={isRecording ? "destructive" : "default"}
                  className="w-32 h-32 rounded-full flex flex-col gap-2 relative overflow-hidden"
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <>
                      <div className="animate-pulse w-8 h-8 rounded-sm bg-white" />
                      <span className="font-mono">{formatTime(recordingTime)}</span>
                      <div className="absolute inset-0 border-4 border-white/20 rounded-full animate-ping" />
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-primary-foreground" />
                      <span>Record</span>
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                  <div className="bg-muted px-4 py-3 rounded-md w-full flex items-center justify-between">
                    <span className="text-sm font-medium">Recording saved</span>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <span className="text-xs text-muted-foreground font-mono">{formatTime((audioBlob as any).duration || recordingTime)}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setAudioBlob(null); setRecordingTime(0); }} className="w-full">
                    Discard & Re-record
                  </Button>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <Button
          onClick={handleExtract}
          disabled={
            (activeTab === "text" && !text.trim()) ||
            (activeTab === "link" && !url.trim()) ||
            (activeTab === "pdf" && !pdfFile) ||
            (activeTab === "voice" && !audioBlob)
          }
          className="w-full"
        >
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

      {/* Input Preview banner */}
      {sourceMeta && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-b pb-4 mb-4">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold">
            {sourceMeta.source}
          </Badge>
          <span className="truncate">
            {sourceMeta.source === "url" && sourceMeta.title
              ? `${sourceMeta.title} (${new URL(sourceMeta.source_ref).hostname})`
              : sourceMeta.source === "url"
                ? sourceMeta.source_ref
                : "Manual text input"}
          </span>
        </div>
      )}

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
                    {!checkedNodes[root.temp_id] && (
                      <span className="text-[10px] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded ml-2">Auto: demoted</span>
                    )}
                  </div>
                  {root.evidence && (
                    <div className="px-3 pb-1 pt-0">
                      <p className="text-[10px] text-muted-foreground truncate italic">&ldquo;{root.evidence}&rdquo;</p>
                    </div>
                  )}
                  {(root.facts || []).length > 0 && (
                    <div className="px-3 pb-2 space-y-1">
                      {root.facts.map((fact, i) => {
                        const key = `${root.temp_id}::${i}`;
                        return (
                          <div key={key} className="flex items-start gap-2 group ml-4">
                            <Checkbox
                              checked={checkedNodeFacts[key] ?? false}
                              onCheckedChange={(v) =>
                                setCheckedNodeFacts((p) => ({ ...p, [key]: !!v }))
                              }
                            />
                            <span className="text-[11px] leading-snug flex-1 text-muted-foreground">{fact}</span>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-500 hover:text-blue-700 font-medium px-2 shrink-0"
                              onClick={() => handlePromoteFact(root.temp_id, i)}
                            >
                              Promote to node
                            </button>
                          </div>
                        );
                      })}
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
                              {!checkedNodes[n.temp_id] && (
                                <span className="text-[10px] text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded ml-2">Auto: demoted</span>
                              )}
                            </div>
                            {n.evidence && (
                              <p className="text-[10px] text-muted-foreground truncate italic mt-0.5 ml-7">
                                &ldquo;{n.evidence}&rdquo;
                              </p>
                            )}
                            {(n.facts || []).length > 0 && (
                              <div className="mt-1.5 ml-7 space-y-1 pb-1">
                                {n.facts.map((fact, i) => {
                                  const key = `${n.temp_id}::${i}`;
                                  return (
                                    <div key={key} className="flex items-start gap-2 group">
                                      <Checkbox
                                        checked={checkedNodeFacts[key] ?? false}
                                        onCheckedChange={(v) =>
                                          setCheckedNodeFacts((p) => ({ ...p, [key]: !!v }))
                                        }
                                      />
                                      <span className="text-[11px] leading-snug flex-1 text-muted-foreground">{fact}</span>
                                      <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-500 hover:text-blue-700 font-medium px-2 shrink-0"
                                        onClick={() => handlePromoteFact(n.temp_id, i)}
                                      >
                                        Promote to node
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
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
