import OpenAI from "openai";
import type { ExtractionResult } from "@/types/database";

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function buildSubtopicPrompt(title: string, ancestorChain: string[]): string {
  const context =
    ancestorChain.length > 0
      ? `This topic is a subtopic of: ${ancestorChain.join(" → ")}`
      : "This is a top-level topic.";

  return `You are helping a user build a personal knowledge graph for learning.

Topic: "${title}"
${context}

Generate 6-8 specific subtopics for "${title}" that are:
- Granular and testable (suitable for generating flashcards)
- Not overly broad (e.g. avoid "History of X" as a subtopic of "X")
- Distinct from each other (no near-duplicates)
- Appropriate depth for the position in the hierarchy

These will be used for learning and generating flashcards.

Return ONLY a JSON array of strings. Example: ["Subtopic 1", "Subtopic 2", "Subtopic 3"]`;
}

export function buildNodeDetailPrompt(title: string, ancestorChain: string[]): string {
  const context =
    ancestorChain.length > 0
      ? `This topic is a subtopic of: ${ancestorChain.join(" → ")}`
      : "This is a top-level topic.";

  return `You are helping a user learn about a topic.

Topic: "${title}"
${context}

Provide:
1. A 2-3 sentence summary of this topic
2. 4-5 concrete, testable facts about this topic

Return ONLY a JSON object with this exact shape:
{
  "summary": "2-3 sentence summary here",
  "key_facts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5"]
}`;
}

export async function generateSubtopics(
  title: string,
  ancestorChain: string[]
): Promise<string[]> {
  const openai = getOpenAIClient();
  if (!openai) return [];

  const client = openai;
  const prompt = buildSubtopicPrompt(title, ancestorChain);

  async function tryParse(userMsg: string): Promise<string[] | null> {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.7,
      max_tokens: 300,
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return parsed as string[];
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const result = await tryParse(prompt);
    if (result) return result;
    // Retry with repair prompt
    const repairResult = await tryParse(
      `${prompt}\n\nReturn only a JSON array of strings, nothing else.`
    );
    return repairResult ?? [];
  } catch (err) {
    console.error("Subtopic generation error:", err);
    return [];
  }
}

export interface NodeDetail {
  summary: string;
  key_facts: string[];
}

export async function generateNodeDetail(
  title: string,
  ancestorChain: string[]
): Promise<NodeDetail | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const prompt = buildNodeDetailPrompt(title, ancestorChain);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { summary?: string; key_facts?: string[] };
    if (!parsed.summary || !Array.isArray(parsed.key_facts)) return null;
    return { summary: parsed.summary, key_facts: parsed.key_facts };
  } catch (err) {
    console.error("Node detail generation error:", err);
    return null;
  }
}

export interface GapAnalysis {
  foundational: string[];
  advanced: string[];
  learning_path: string[];
}

export async function generateGapAnalysis(
  title: string,
  childTitles: string[],
  ancestorChain: string[],
  userNotes: string | null,
  userFacts: string[]
): Promise<GapAnalysis | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const ancestorContext =
    ancestorChain.length > 0
      ? `This topic is a subtopic of: ${ancestorChain.join(" → ")}`
      : "This is a top-level topic.";

  const prompt = `Topic: "${title}"
${ancestorContext}

${userNotes ? `User's notes: "${userNotes.slice(0, 300)}"` : ""}
${userFacts.length ? `User's key takeaways:\n${userFacts.map((f) => `- ${f}`).join("\n")}` : ""}

Existing subtopics already mapped:
${childTitles.length ? childTitles.map((t) => `- ${t}`).join("\n") : "(none yet)"}

Identify what to learn next. Do NOT repeat or paraphrase any existing subtopic titles.
Foundational and advanced items must be noun phrases (3–7 words). No verbs like "learn", "understand", "study".
Learning_path items may be short imperative action steps.
Do not repeat across sections. Avoid generic umbrella terms unless essential.
Return plain strings only — no punctuation at end, no numbering, no duplicates after casefolding.
Return JSON:
{
  "foundational": ["missing concept A", ...],
  "advanced": ["extension B", ...],
  "learning_path": ["step 1", "step 2", ...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 600,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      foundational?: unknown;
      advanced?: unknown;
      learning_path?: unknown;
    };
    if (
      !Array.isArray(parsed.foundational) ||
      !Array.isArray(parsed.advanced) ||
      !Array.isArray(parsed.learning_path)
    )
      return null;
    return {
      foundational: (parsed.foundational as unknown[]).filter((s) => typeof s === "string") as string[],
      advanced: (parsed.advanced as unknown[]).filter((s) => typeof s === "string") as string[],
      learning_path: (parsed.learning_path as unknown[]).filter((s) => typeof s === "string") as string[],
    };
  } catch (err) {
    console.error("Gap analysis generation error:", err);
    return null;
  }
}

export interface SynthesisResult {
  connections: string[];
  contradictions: string[];
  applications: string[];
  insights: string[];
  suggested_links: { from: string; to: string; why: string }[];
}

export async function generateSynthesis(
  nodes: {
    title: string;
    description?: string | null;
    user_notes?: string | null;
    user_facts?: string[] | null;
  }[]
): Promise<SynthesisResult | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const nodeContext = nodes
    .map(
      (n) =>
        `**${n.title}**` +
        (n.description ? `\nSummary: ${n.description}` : "") +
        (n.user_notes?.trim() ? `\nUser notes: ${n.user_notes.trim().slice(0, 200)}` : "") +
        (n.user_facts?.length ? `\nUser takeaways: ${n.user_facts.slice(0, 3).join("; ")}` : "")
    )
    .join("\n\n");

  const prompt = `You are synthesizing insights across multiple knowledge nodes.

Topics:
${nodeContext}

Return JSON:
{
  "connections": ["how these relate...", ...],
  "contradictions": ["tension or paradox...", ...],
  "applications": ["real-world use...", ...],
  "insights": ["emergent insight only visible together", ...],
  "suggested_links": [
    {"from": "exact node title A", "to": "exact node title B", "why": "one sentence"}
  ]
}

Use exact titles from the list above. Do not invent new titles in suggested_links.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 900,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      connections?: unknown;
      contradictions?: unknown;
      applications?: unknown;
      insights?: unknown;
      suggested_links?: unknown;
    };
    return {
      connections: Array.isArray(parsed.connections)
        ? (parsed.connections as string[])
        : [],
      contradictions: Array.isArray(parsed.contradictions)
        ? (parsed.contradictions as string[])
        : [],
      applications: Array.isArray(parsed.applications)
        ? (parsed.applications as string[])
        : [],
      insights: Array.isArray(parsed.insights)
        ? (parsed.insights as string[])
        : [],
      suggested_links: Array.isArray(parsed.suggested_links)
        ? (parsed.suggested_links as { from: string; to: string; why: string }[]).filter(
          (l) =>
            typeof l.from === "string" &&
            typeof l.to === "string" &&
            typeof l.why === "string"
        )
        : [],
    };
  } catch (err) {
    console.error("Synthesis generation error:", err);
    return null;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

const ACRONYM_MAP: Record<string, string[]> = {
  nlp: ["natural language processing", "natural language programming"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  cv: ["computer vision"],
  os: ["operating systems"],
  db: ["database", "databases"],
  cs: ["computer science"],
  oop: ["object oriented programming"],
  fp: ["functional programming"],
  ui: ["user interface"],
  ux: ["user experience"],
};

function selectTopCandidates(
  text: string,
  nodes: { id: string; title: string; breadcrumb?: string }[],
  topK = 50
): { id: string; title: string; breadcrumb?: string }[] {
  const normText = normalize(text.slice(0, 4000));
  const textWords = new Set(normText.split(" ").filter((w) => w.length > 2));

  const scored = nodes.map((n) => {
    const normTitle = normalize(n.title);

    // Direct substring match → highest score
    if (normText.includes(normTitle)) return { ...n, score: 1.0 };

    // Token recall: fraction of title words found in text
    const titleWords = normTitle.split(" ").filter((w) => w.length > 2);
    const overlap = titleWords.filter((w) => textWords.has(w)).length;
    let score = titleWords.length > 0 ? overlap / titleWords.length : 0;

    // Acronym boost: if text contains acronym that expands to this node's title
    for (const [acronym, expansions] of Object.entries(ACRONYM_MAP)) {
      if (textWords.has(acronym)) {
        for (const exp of expansions) {
          if (normTitle.includes(exp) || exp.includes(normTitle)) {
            score = Math.max(score, 0.8);
          }
        }
      }
    }

    return { ...n, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function generateKnowledgeExtraction(
  text: string,
  existingNodes: { id: string; title: string; breadcrumb?: string }[]
): Promise<ExtractionResult | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const candidates = selectTopCandidates(text, existingNodes);
  const existingList =
    candidates.length > 0
      ? candidates.map((n) => {
        const label = n.breadcrumb && n.breadcrumb !== n.title ? n.breadcrumb : n.title;
        return `- ${label} (id: ${n.id})`;
      }).join("\n")
      : "(none)";

  const hasExistingNodes = candidates.length > 0;

  const prompt = `You are helping a user ADD new information to their personal knowledge graph from freeform text.

INPUT TEXT:
${text.slice(0, 10000)}

EXISTING NODES IN GRAPH:
${existingList}

TASK:${hasExistingNodes ? `
1. FIRST, identify which existing nodes the input text relates to.
2. Create a root in "roots" with ALL the new children/grandchildren extracted from the text.
3. ALSO create a "matches" entry linking that root's temp_id to the existing node's id. This tells the system to merge the root's children under the existing node instead of creating a new top-level node.
4. ONLY omit a match for a root if the topic genuinely has NO match in the existing graph.` : `
1. Extract the major knowledge areas, skills, projects, people, books, and concepts from the text.
2. Organize them into a 3-level hierarchy: roots → children → grandchildren.`}

RULES:
- Each root: up to 14 children. Each child: up to 14 grandchildren.
- Prefer more nodes over fewer — do not collapse siblings into a parent.
- NEVER truncate repeating structures. If the text lists 12 weeks, 10 chapters, 8 assignments, etc., include ALL of them as separate nodes — do not stop partway through.
- Exhaustively cover the text: every distinct skill, course, concept, project, person, or book mentioned deserves its own node.
- Titles: 2–6 word noun phrases. No generic umbrella terms. No dates. No punctuation.
- For each node, include an "evidence" field: a short verbatim/near-verbatim snippet from the input (≤120 chars) that justifies this node.
- Assign node_type meaningfully: "skill" for abilities, "person" for people, "book" for books/media, "project" for projects, "topic" for broad areas, "concept" for specific concepts, "question" for open questions, "insight" for epiphanies.${hasExistingNodes ? `
- IMPORTANT: Every root MUST appear in the "roots" array with its full children tree. A match entry ONLY links a root to an existing node — it does NOT replace the root. You must have BOTH a root (with children) AND a match pointing to it.
- When the text is clearly about an existing topic (e.g. a course syllabus for "Deep Learning" when "Deep Learning" exists), create ONE root with all content as children, and add a match linking it to the existing node.
- Treat common abbreviations as equivalent when matching (e.g., "NLP" ≈ "Natural Language Processing", "ML" ≈ "Machine Learning").
- Prefer matching to an existing node over creating a new one. When in doubt, match.
- add_facts in matches should be short string facts to append to the existing node, not child nodes.` : ``}
- Write a 1–2 sentence "summary" of what you found in the text.

Return JSON exactly:
{
  "summary": "...",
  "roots": [
    {
      "temp_id": "root_1",
      "title": "...",
      "node_type": "topic|concept|person|book|skill|project|question|insight",
      "evidence": "...",
      "children": [
        {
          "temp_id": "child_1_1",
          "title": "...",
          "node_type": "...",
          "evidence": "...",
          "children": [
            {
              "temp_id": "grand_1_1_1",
              "title": "...",
              "node_type": "...",
              "evidence": "..."
            }
          ]
        }
      ]
    }
  ],
  "matches": [
    {
      "temp_id": "root_1",
      "proposed_title": "...",
      "matched_node_id": "...",
      "matched_node_title": "...",
      "confidence": 0.9,
      "evidence": "...",
      "add_facts": ["fact 1", "fact 2"]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 8000,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      summary?: unknown;
      roots?: unknown;
      matches?: unknown;
    };
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.roots)) return null;

    // Sanitize matches: ensure add_facts only contains strings
    const rawMatches = Array.isArray(parsed.matches) ? parsed.matches as Record<string, unknown>[] : [];
    const sanitizedMatches: ExtractionResult["matches"] = rawMatches
      .filter((m) => typeof m.matched_node_id === "string" && typeof m.temp_id === "string")
      .map((m) => ({
        temp_id: m.temp_id as string,
        proposed_title: (m.proposed_title as string) ?? "",
        matched_node_id: m.matched_node_id as string,
        matched_node_title: (m.matched_node_title as string) ?? "",
        confidence: typeof m.confidence === "number" ? m.confidence : 0.8,
        evidence: typeof m.evidence === "string" ? m.evidence : "",
        add_facts: Array.isArray(m.add_facts)
          ? (m.add_facts as unknown[]).filter((f): f is string => typeof f === "string")
          : [],
      }));

    return {
      summary: parsed.summary,
      roots: parsed.roots as ExtractionResult["roots"],
      matches: sanitizedMatches,
    };
  } catch (err) {
    console.error("Knowledge extraction error:", err);
    return null;
  }
}

export const ROOT_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // purple
  "#0ea5e9", // sky
];

export function pickRootColor(existingCount: number): string {
  return ROOT_COLORS[existingCount % ROOT_COLORS.length];
}
