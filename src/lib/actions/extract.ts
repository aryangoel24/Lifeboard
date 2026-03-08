"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateKnowledgeExtraction } from "@/lib/knowledge-utils";
import { getOrCreateInboxNode, syncNodeEmbedding } from "@/lib/actions/knowledge";
import type { ExtractionResult, NodeType } from "@/types/database";

export type ApprovedExtractionNode = {
  temp_id: string;
  title: string;
  nodeType: NodeType;
  parentTempId: string | null;
  evidence: string;
  facts: string[];
};

export type ApprovedMatch = {
  matched_node_id: string;
  add_facts: string[];
};

export type RootRouting = Record<string, { mode: "new" } | { mode: "merge"; targetNodeId: string } | { mode: "child"; targetNodeId: string }>;

export type ExtractionSourcePayload =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "pdf"; formData: FormData }
  | { kind: "voice"; formData: FormData };

// Generic user-agent to avoid simple scraping blocks
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function extractKnowledgeFromSource(
  payload: ExtractionSourcePayload,
  overrideUserId?: string
): Promise<
  | {
    result: ExtractionResult;
    allNodes: { id: string; title: string; breadcrumb: string }[];
    sourceMeta: { source: string; source_ref: string; title?: string; siteName?: string };
  }
  | { error: string }
> {
  let supabase: ReturnType<typeof createClient>;
  let user: { id: string } | null = null;

  if (overrideUserId) {
    supabase = createAdminClient();
    user = { id: overrideUserId };
  } else {
    supabase = createClient();
    const authRet = await supabase.auth.getUser();
    user = authRet.data.user;
  }

  if (!user) return { error: "Unauthorized" };

  let textToExtract = "";
  const sourceMeta: { source: string; source_ref: string; title?: string; siteName?: string } = {
    source: payload.kind,
    source_ref: "",
  };

  if (payload.kind === "text") {
    textToExtract = payload.text;
    sourceMeta.source_ref = "manual_text";
  } else if (payload.kind === "url") {
    sourceMeta.source_ref = payload.url;
    try {
      const urlObj = new URL(payload.url);
      if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
        return { error: "Only HTTP/HTTPS URLs are allowed." };
      }
      // Basic SSRF guard (can be expanded)
      const hostname = urlObj.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) || // 172.16.x.x - 172.31.x.x
        hostname.endsWith(".local")
      ) {
        return { error: "Private or local URLs are not allowed." };
      }

      // Fetch with timeout and size limit
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(payload.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { error: `Failed to fetch URL: ${res.status} ${res.statusText}` };
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        return { error: "URL content is too large (max 5MB)." };
      }

      const html = await res.text();

      const { JSDOM } = await import("jsdom");
      const { Readability } = await import("@mozilla/readability");

      const dom = new JSDOM(html, { url: payload.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article && article.textContent && article.textContent.trim().length > 200) {
        textToExtract = article.textContent;
        sourceMeta.title = article.title || undefined;
        sourceMeta.siteName = article.siteName || undefined;
      } else {
        // Fallback to basic innerText if Readability fails or returns tiny payload
        textToExtract = dom.window.document.body.textContent || "";
        textToExtract = textToExtract.replace(/\s+/g, " ").trim();
        sourceMeta.title = dom.window.document.title || undefined;
      }

      if (!textToExtract || textToExtract.length < 50) {
        return { error: "Could not extract sufficient text from this URL." };
      }
    } catch (err: unknown) {
      console.error("URL extraction error:", err);
      const errName = err instanceof Error ? err.name : "";
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errName === "AbortError") return { error: "URL fetch timed out." };
      return { error: "Failed to parse URL. " + errMsg };
    }
  } else if (payload.kind === "pdf") {
    const file = payload.formData.get("file") as File | null;
    if (!file) return { error: "No PDF file provided." };
    if (file.size > 10 * 1024 * 1024) return { error: "PDF is too large (max 10MB)." };

    sourceMeta.source_ref = file.name;
    sourceMeta.title = file.name;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      textToExtract = await new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PDFParser = require("pdf2json");
        const pdfParser = new PDFParser(null, 1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
          resolve(pdfParser.getRawTextContent());
        });

        pdfParser.parseBuffer(buffer);
      });

      // Scanning detection heuristic: if text length is tiny compared to file size
      // (e.g. < 500 chars for a 1MB file, it's probably almost entirely scanned images)
      if (textToExtract.trim().length < 200) {
        return { error: "This looks like a scanned PDF without embedded text. Try copying the text manually or using an OCR tool." };
      }

      // Chunking strategy: if it's massive (> 40k chars, approx 10k tokens)
      const MAX_CHARS = 40000;
      if (textToExtract.length > MAX_CHARS) {
        // V1 simple strategy: just take the most dense chunks to avoid token limits
        // We split loosely by pages (pdf-parse usually puts \n\n between pages)
        const pages = textToExtract.split(/\n\n+/);
        if (pages.length > 3) {
          // Take first 2 pages for intro/context
          const intro = pages.slice(0, 2).join("\n\n");
          // Find the densest middle page
          const remaining = pages.slice(2);
          let densest = remaining[0];
          for (const p of remaining) {
            if (p.length > densest.length) densest = p;
          }
          textToExtract = intro + "\n\n...[content truncated]...\n\n" + densest;
        } else {
          textToExtract = textToExtract.slice(0, MAX_CHARS);
        }
      }
    } catch (err: unknown) {
      console.error("PDF parsing error:", err);
      return { error: "Failed to parse PDF file." };
    }
  } else if (payload.kind === "voice") {
    const file = payload.formData.get("file") as File | null;
    if (!file) return { error: "No voice memo provided." };
    if (file.size > 25 * 1024 * 1024) return { error: "Audio file is too large (max 25MB). Please keep recordings under 10 minutes." };

    // Fallback name if none provided
    sourceMeta.source_ref = file.name || `Voice Note ${new Date().toLocaleDateString()}`;
    sourceMeta.title = sourceMeta.source_ref;

    try {
      const { getOpenAIClient } = await import("@/lib/knowledge-utils");
      const openai = getOpenAIClient();
      if (!openai) return { error: "AI client not configured." };

      const response = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: "en",
      });

      textToExtract = response.text;

      if (!textToExtract || textToExtract.trim().length < 10) {
        return { error: "Could not transcribe any words from this audio file." };
      }
    } catch (err: unknown) {
      console.error("Voice transcription error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return { error: "Failed to transcribe audio file. " + errMsg };
    }
  }

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

  const result = await generateKnowledgeExtraction(textToExtract, allNodes);
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

  return { result, allNodes, sourceMeta };
}

export async function applyExtraction(
  extractionId: string,
  approvedNodes: ApprovedExtractionNode[],
  approvedMatches: ApprovedMatch[],
  rootRouting?: RootRouting,
  overrideUserId?: string
): Promise<void | { error: string }> {
  let supabase: ReturnType<typeof createClient>;
  let user: { id: string } | null = null;

  if (overrideUserId) {
    supabase = createAdminClient();
    user = { id: overrideUserId };
  } else {
    supabase = createClient();
    const authRet = await supabase.auth.getUser();
    user = authRet.data.user;
  }

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

  const nodesToSync = new Set<string>();

  // Step 2: Handle roots — split into new vs merge vs child
  const rootsForNew: typeof roots = [];
  const rootsForMerge: { root: (typeof roots)[0]; targetNodeId: string }[] = [];
  const rootsForChild: { root: (typeof roots)[0]; targetNodeId: string }[] = [];

  for (const r of roots) {
    const routing = rootRouting?.[r.temp_id];
    if (routing?.mode === "merge") {
      rootsForMerge.push({ root: r, targetNodeId: routing.targetNodeId });
    } else if (routing?.mode === "child") {
      rootsForChild.push({ root: r, targetNodeId: routing.targetNodeId });
    } else {
      rootsForNew.push(r);
    }
  }

  // Pre-populate tempIdToDbId and parentMetaMap for explicit merge and child targets
  const allTargetIds = [
    ...rootsForMerge.map((m) => m.targetNodeId),
    ...rootsForChild.map((c) => c.targetNodeId),
  ];

  if (allTargetIds.length > 0) {
    const { data: targetNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, depth, root_id")
      .in("id", allTargetIds)
      .eq("user_id", user.id);

    const metaById = new Map(
      (targetNodes ?? []).map((n) => [
        n.id as string,
        { depth: n.depth as number, root_id: n.root_id as string },
      ])
    );

    for (const { root, targetNodeId } of rootsForMerge) {
      tempIdToDbId.set(root.temp_id, targetNodeId);
      const meta = metaById.get(targetNodeId);
      if (meta) parentMetaMap.set(targetNodeId, meta);
    }

    // For "child" routing, the tempId gets no mapping yet (it will be inserted as a new row)
    // but its parentMeta must be known so `insertLevel` or direct insertion works
    for (const { targetNodeId } of rootsForChild) {
      const meta = metaById.get(targetNodeId);
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
        user_facts: r.facts,
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
          nodesToSync.add(inserted.id as string);
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

  // Step 3b: Insert explicit children roots
  if (rootsForChild.length > 0) {
    // Collect all parent IDs targeted by the child-mode roots
    const childParentIds = Array.from(new Set(rootsForChild.map(r => r.targetNodeId)));

    // Fetch existing siblings under those targets to avoid exact name duplicates
    const { data: existingSiblings } = await supabase
      .from("knowledge_nodes")
      .select("parent_id, title")
      .in("parent_id", childParentIds)
      .eq("user_id", user.id);

    const siblingsByParent = new Map<string, Set<string>>();
    for (const s of existingSiblings ?? []) {
      const pid = s.parent_id as string;
      if (!siblingsByParent.has(pid)) siblingsByParent.set(pid, new Set());
      siblingsByParent.get(pid)!.add((s.title as string).toLowerCase());
    }

    const seenChildRootTitles = new Set<string>();
    const dedupedChildRoots = rootsForChild.filter((rc) => {
      const key = `${rc.targetNodeId}::${rc.root.title.toLowerCase()}`;
      if (seenChildRootTitles.has(key)) return false;
      const existingInParent = siblingsByParent.get(rc.targetNodeId);
      if (existingInParent?.has(rc.root.title.toLowerCase())) return false; // Hard skip duplicates to avoid 23505
      seenChildRootTitles.add(key);
      return true;
    });

    if (dedupedChildRoots.length > 0) {
      const childRows = dedupedChildRoots.map(({ root: r, targetNodeId }) => {
        const pMeta = parentMetaMap.get(targetNodeId);
        // Fallback meta just in case, though target should always exist
        const depth = pMeta ? pMeta.depth + 1 : (inboxNode.depth as number) + 1;
        const rootId = pMeta ? pMeta.root_id : inboxNode.root_id;

        return {
          user_id: user.id,
          parent_id: targetNodeId,
          root_id: rootId,
          title: r.title,
          node_type: r.nodeType,
          position_x: 0,
          position_y: 0,
          depth,
          ai_generated: true,
          source: "extract",
          source_ref: extractionId,
          ai_evidence: r.evidence.slice(0, 120),
          user_facts: r.facts,
        };
      });

      const { data: insertedChildRoots, error: childRootError } = await supabase
        .from("knowledge_nodes")
        .insert(childRows)
        .select("id, title, parent_id");

      if (childRootError) {
        if (childRootError.code !== "23505") {
          return { error: childRootError.message };
        }
      } else {
        for (const inserted of insertedChildRoots ?? []) {
          nodesToSync.add(inserted.id as string);
          const originalPair = dedupedChildRoots.find(
            (cr) => cr.root.title === inserted.title && cr.targetNodeId === (inserted.parent_id as string)
          );
          if (originalPair) {
            tempIdToDbId.set(originalPair.root.temp_id, inserted.id as string);
            const pMeta = parentMetaMap.get(originalPair.targetNodeId)!;
            parentMetaMap.set(inserted.id as string, {
              depth: pMeta.depth + 1,
              root_id: pMeta.root_id,
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
          user_facts: n.facts,
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
        nodesToSync.add(ins.id as string);
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

  // Step 6: Apply approved matches — merge add_facts and root facts into existing nodes
  const patchesByTargetId = new Map<string, string[]>();

  for (const m of approvedMatches) {
    if (m.add_facts.length > 0) {
      if (!patchesByTargetId.has(m.matched_node_id)) {
        patchesByTargetId.set(m.matched_node_id, []);
      }
      patchesByTargetId.get(m.matched_node_id)!.push(...m.add_facts);
    }
  }

  for (const r of rootsForMerge) {
    if (r.root.facts && r.root.facts.length > 0) {
      if (!patchesByTargetId.has(r.targetNodeId)) {
        patchesByTargetId.set(r.targetNodeId, []);
      }
      patchesByTargetId.get(r.targetNodeId)!.push(...r.root.facts);
    }
  }

  if (patchesByTargetId.size > 0) {
    const targetNodeIds = Array.from(patchesByTargetId.keys());
    const { data: existingMatchNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, user_facts")
      .in("id", targetNodeIds)
      .eq("user_id", user.id);

    const factsById = new Map<string, string[]>(
      (existingMatchNodes ?? []).map((n) => [n.id as string, (n.user_facts as string[]) ?? []])
    );

    await Promise.all(
      Array.from(patchesByTargetId.entries()).map(([targetId, newFacts]) => {
        const existing = factsById.get(targetId) ?? [];
        const existingLower = new Set(existing.map((f) => f.toLowerCase()));

        const filteredNew = newFacts.filter((f) => !existingLower.has(f.toLowerCase()));
        if (filteredNew.length === 0) return Promise.resolve(null);

        const merged = [
          ...existing,
          ...filteredNew,
        ];

        nodesToSync.add(targetId);

        return supabase
          .from("knowledge_nodes")
          .update({ user_facts: merged, updated_at: new Date().toISOString() })
          .eq("id", targetId)
          .eq("user_id", user.id);
      })
    );
  }

  // Trigger embedding updates asynchronously for all newly added or patched nodes
  Array.from(nodesToSync).forEach((id) => {
    void syncNodeEmbedding(id).catch(console.error);
  });

  revalidatePath("/learn/hub");
}

export async function directIngestKnowledgeToInbox(payload: ExtractionSourcePayload, overrideUserId?: string) {
  let supabase: ReturnType<typeof createClient>;
  let user: { id: string } | null = null;

  if (overrideUserId) {
    supabase = createAdminClient();
    user = { id: overrideUserId };
  } else {
    supabase = createClient();
    const authRet = await supabase.auth.getUser();
    user = authRet.data.user;
  }

  if (!user) return { error: "Unauthorized" };

  // 1. Fetch Inbox Node ID
  const inboxNodeId = await getOrCreateInboxNode(user.id, supabase);

  // 2. Perform raw extraction
  const extractRes = await extractKnowledgeFromSource(payload, user.id);
  if ("error" in extractRes) {
    return extractRes; // pass error bubble up
  }

  const { result } = extractRes;

  // 3. Map the raw extraction blocks into "Approved" formats (auto-approving everything)
  const approvedNodes: ApprovedExtractionNode[] = [];

  // Recursively flatten the extraction hierarchy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function flattenNodes(node: any, parentTempId: string | null = null) {
    approvedNodes.push({
      temp_id: node.proposed_id,
      title: node.title,
      nodeType: node.node_type || node.nodeType || "insight",
      parentTempId: parentTempId,
      evidence: node.evidence || "",
      facts: node.facts || []
    });
    if (node.children) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const child of node.children as any[]) {
        flattenNodes(child, node.proposed_id);
      }
    }
  }

  for (const root of result.roots) {
    flattenNodes(root, null);
  }

  // Generate unique routing instructions:
  // Any node that had no parent in the extraction (a root) should be routed as a child of INBOX.
  const rootRouting: RootRouting = {};
  for (const node of approvedNodes) {
    if (!node.parentTempId) {
      rootRouting[node.temp_id] = { mode: "child", targetNodeId: inboxNodeId };
    }
  }

  // 4. Submit to the universal apply handler
  const sourceRef = payload.kind === "text" ? "manual_text" :
    payload.kind === "url" ? payload.url :
      "upload";

  const applyRes = await applyExtraction(
    sourceRef,    // extractionId/SourceRef
    approvedNodes,
    [],           // no matches for direct inbox ingestion
    rootRouting,
    user.id       // propagate auth override
  );

  return applyRes;
}
