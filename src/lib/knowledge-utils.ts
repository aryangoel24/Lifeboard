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
