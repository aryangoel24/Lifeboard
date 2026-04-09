import OpenAI from "openai";

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// Model registry — change a model in one place and it updates everywhere.
export const MODELS = {
  gpt4o: "gpt-4o",
  gpt4oMini: "gpt-4o-mini",
  textEmbedding3Small: "text-embedding-3-small",
  whisper1: "whisper-1",
} as const;

export type ModelKey = keyof typeof MODELS;
