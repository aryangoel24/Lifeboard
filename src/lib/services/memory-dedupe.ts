import type { UserMemory } from "@/types/database";

const STOP_WORDS = new Set([
  "i", "the", "a", "an", "is", "are", "was", "user", "tends", "to", "of", "on",
  "in", "at", "my", "and", "or", "for", "with", "has", "have", "had", "they",
  "this", "that", "it", "be", "not", "but", "as", "by", "from",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const aArr = Array.from(a);
  const bArr = Array.from(b);
  const intersection = new Set(aArr.filter((x) => b.has(x)));
  const union = new Set([...aArr, ...bArr]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export function findSimilarMemory(
  candidate: { memory_source: string; type: string; content: string },
  existing: UserMemory[],
  threshold = 0.6
): UserMemory | null {
  const candidateTokens = tokenize(candidate.content);

  const results = existing
    .filter(
      (m) =>
        m.memory_source === candidate.memory_source && m.type === candidate.type
    )
    .map((m) => ({
      memory: m,
      similarity: jaccardSimilarity(candidateTokens, tokenize(m.content)),
    }))
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  return results[0]?.memory ?? null;
}
