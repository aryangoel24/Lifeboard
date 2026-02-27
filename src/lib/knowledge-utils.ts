import OpenAI from "openai";

function getOpenAIClient(): OpenAI | null {
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
