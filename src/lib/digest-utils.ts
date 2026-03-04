import OpenAI from "openai";
import type { DigestPayload, DigestNodeUpdate, DigestNewNode, DigestUnassigned } from "@/types/database";

export type CandidateNodeRef = {
  id: string;
  title: string;
  breadcrumb: string;
  node_type: string;
};

type NodeRow = {
  id: string;
  title: string;
  parent_id: string | null;
  depth: number;
  mastery_status: string;
  node_type: string;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "been",
  "will", "what", "when", "where", "which", "there", "their", "they",
  "about", "more", "some", "like", "into", "than", "then", "also",
  "were", "your", "just", "its", "are", "was", "has", "had",
]);

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function selectCandidateNodes(nodes: NodeRow[], journalText: string): NodeRow[] {
  const tokens = journalText
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const tokenSet = new Set(tokens);

  const scored = nodes.map((node) => {
    const titleWords = node.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 1);
    let score = titleWords.filter((w) => tokenSet.has(w)).length;
    if (node.mastery_status === "learning") score += 2;
    return { node, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((s) => s.node);
}

export function buildBreadcrumb(
  nodeId: string,
  allNodes: Array<{ id: string; title: string; parent_id: string | null }>
): string {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const chain: string[] = [];
  let cur = nodeById.get(nodeId);
  while (cur) {
    chain.unshift(cur.title);
    cur = cur.parent_id ? nodeById.get(cur.parent_id) : undefined;
  }
  return chain.join(" → ");
}

export function buildDigestPrompt(
  journalText: string,
  candidateNodes: CandidateNodeRef[],
  inboxNodeId: string
): string {
  const candidateList = candidateNodes
    .map(
      (n) =>
        `{ "id": "${n.id}", "title": ${JSON.stringify(n.title)}, "breadcrumb": ${JSON.stringify(n.breadcrumb)}, "node_type": "${n.node_type}" }`
    )
    .join("\n");

  return `You are analyzing a daily journal entry and mapping it to an existing personal knowledge graph.

Journal entry:
---
${journalText}
---

Available knowledge nodes (ONLY these node IDs are valid to reference):
${candidateList || "(no nodes yet)"}

Inbox node ID (fallback parent for new nodes): "${inboxNodeId}"

Analyze the journal and return a JSON object with these sections:
1. summary: 1-3 sentence summary of the day
2. highlights: 2-5 key bullet points
3. node_updates: existing nodes that relate to journal content (add takeaways)
4. new_nodes: new concepts worth adding that are not in the graph yet
5. unassigned: content from the journal that couldn't be matched

STRICT CONSTRAINTS:
- Proposed node titles MUST be 2-6 words, noun phrases only
- If an item could be a fact on an existing node, do that. Only propose new nodes when the subject is likely to recur and be linkable.
- Do NOT suggest nodes named "Overview", "Introduction", "Basics", "Advanced Topics", or other generic umbrella terms
- Do NOT suggest a new node that duplicates an existing child title under the same parent
- "suggested_parent_node_id" MUST be one of the provided node IDs listed above, or the inboxNodeId "${inboxNodeId}"
- Only reference node IDs from the candidate list — never invent IDs
- Maximum 10 node_updates, maximum 10 new_nodes
- Use temp_id values "new_1", "new_2", etc. for new nodes

Return ONLY valid JSON matching this exact schema:
{
  "summary": "string",
  "highlights": ["string"],
  "node_updates": [
    {
      "node_id": "uuid from candidate list",
      "confidence": 0.0,
      "add_takeaways": ["string"]
    }
  ],
  "new_nodes": [
    {
      "temp_id": "new_1",
      "proposed_title": "2-6 word noun phrase",
      "node_type": "concept|topic|skill|book|person|project|question|insight",
      "suggested_parent_node_id": "uuid or inboxNodeId",
      "why": "brief explanation why this deserves a new node"
    }
  ],
  "unassigned": [
    {
      "text": "...",
      "why_unmatched": "..."
    }
  ]
}`;
}

export async function generateDigestAnalysis(
  journalText: string,
  candidateNodes: CandidateNodeRef[],
  inboxNodeId: string
): Promise<DigestPayload | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const candidateIds = new Set(candidateNodes.map((n) => n.id));
  const prompt = buildDigestPrompt(journalText, candidateNodes, inboxNodeId);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Partial<DigestPayload>;

    const validNodeUpdates: DigestNodeUpdate[] = (parsed.node_updates ?? []).filter(
      (u): u is DigestNodeUpdate =>
        typeof u === "object" &&
        u !== null &&
        typeof (u as DigestNodeUpdate).node_id === "string" &&
        candidateIds.has((u as DigestNodeUpdate).node_id) &&
        Array.isArray((u as DigestNodeUpdate).add_takeaways)
    );

    const rawNewNodes: DigestNewNode[] = (parsed.new_nodes ?? [])
      .filter(
        (n): n is DigestNewNode =>
          typeof n === "object" &&
          n !== null &&
          typeof (n as DigestNewNode).temp_id === "string" &&
          typeof (n as DigestNewNode).proposed_title === "string"
      )
      .map((n) => ({
        ...n,
        suggested_parent_node_id:
          candidateIds.has(n.suggested_parent_node_id) ||
            n.suggested_parent_node_id === inboxNodeId
            ? n.suggested_parent_node_id
            : inboxNodeId,
      }));

    // Fact-first Gating: demote proposed new nodes if they match an existing node closely
    const finalNewNodes: DigestNewNode[] = [];
    const acronyms: Record<string, string> = { nlp: "natural language processing", ml: "machine learning", ai: "artificial intelligence", "c++": "cpp", js: "javascript", ts: "typescript", db: "database", ux: "user experience", ui: "user interface" };

    for (const n of rawNewNodes) {
      const lower = n.proposed_title.toLowerCase().trim();
      const normProposed = (acronyms[lower] || lower).replace(/[^\\w\\s]/g, "").trim();
      if (!normProposed) {
        finalNewNodes.push(n);
        continue;
      }

      let bestScore = 0;
      let bestMatchId: string | null = null;

      for (const cand of candidateNodes) {
        const candLower = cand.title.toLowerCase().trim();
        const normCand = (acronyms[candLower] || candLower).replace(/[^\\w\\s]/g, "").trim();

        if (normCand === normProposed) {
          bestScore = 1.0;
          bestMatchId = cand.id;
          break;
        }

        // Token overlap
        const propTokens = new Set(normProposed.split(/\\s+/).filter(w => w.length > 2));
        const candTokens = normCand.split(/\\s+/).filter(w => w.length > 2);

        if (candTokens.length > 0 && propTokens.size > 0) {
          const overlap = candTokens.filter(t => propTokens.has(t)).length;
          const score = overlap / Math.max(candTokens.length, propTokens.size);
          if (score > bestScore) {
            bestScore = score;
            bestMatchId = cand.id;
          }
        }
      }

      if (bestMatchId && bestScore >= 0.75) {
        // Demote
        let existingUpdate = validNodeUpdates.find(u => u.node_id === bestMatchId);
        if (!existingUpdate) {
          existingUpdate = { node_id: bestMatchId, confidence: bestScore, add_takeaways: [] };
          validNodeUpdates.push(existingUpdate);
        }
        existingUpdate.add_takeaways.push(`[demoted-node] ${n.proposed_title} — ${n.why}`);
      } else {
        finalNewNodes.push(n);
      }
    }

    const validUnassigned: DigestUnassigned[] = Array.isArray(parsed.unassigned)
      ? (parsed.unassigned as DigestUnassigned[]).filter(
        (u) => typeof u === "object" && u !== null && typeof u.text === "string"
      )
      : [];

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((h): h is string => typeof h === "string")
        : [],
      node_updates: validNodeUpdates,
      new_nodes: finalNewNodes,
      unassigned: validUnassigned,
    };
  } catch (err) {
    console.error("Digest analysis generation error:", err);
    return null;
  }
}
