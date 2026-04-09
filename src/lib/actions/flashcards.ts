"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateNextReview } from "@/lib/learning-utils";
import type { Flashcard, FlashcardDeck, ReviewQuality, NewsBriefingContent } from "@/types/learning";
import { getOpenAIClient, MODELS } from "@/lib/openai";

export async function getDueFlashcards(limit = 5): Promise<Flashcard[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("flashcards")
    .select("*")
    .eq("user_id", user.id)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true })
    .limit(limit);

  return (data as Flashcard[]) || [];
}

export async function reviewFlashcard(cardId: string, quality: ReviewQuality) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: card } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (!card) return { error: "Card not found" };

  const { nextInterval, nextEaseFactor, nextRepetitions } = calculateNextReview(
    quality,
    card.ease_factor,
    card.interval_days,
    card.repetitions
  );

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + nextInterval);
  const nextReviewDate = nextDate.toISOString().split("T")[0];

  const { error } = await supabase
    .from("flashcards")
    .update({
      ease_factor: nextEaseFactor,
      interval_days: nextInterval,
      repetitions: nextRepetitions,
      next_review_date: nextReviewDate,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("id", cardId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  return { success: true };
}

export async function createDeck(name: string, description?: string): Promise<FlashcardDeck | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("flashcard_decks")
    .insert({ user_id: user.id, name, description: description || null, source: "user" })
    .select()
    .single();

  return data as FlashcardDeck | null;
}

export async function createFlashcard(deckId: string, front: string, back: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from("flashcards").insert({
    deck_id: deckId,
    user_id: user.id,
    front,
    back,
    next_review_date: today,
  });

  if (error) return { error: error.message };

  revalidatePath("/learn");
  return { success: true };
}

async function getOrCreateDailyDeck(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("flashcard_decks")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "Daily Learning")
    .single();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("flashcard_decks")
    .insert({ user_id: userId, name: "Daily Learning", source: "ai_generated" })
    .select("id")
    .single();

  return created?.id || null;
}

export async function generateFlashcardsFromBriefing(date: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const openai = getOpenAIClient();
  if (!openai) return { error: "OpenAI not configured" };

  const { data: briefingRow } = await supabase
    .from("daily_content")
    .select("content")
    .eq("user_id", user.id)
    .eq("content_date", date)
    .eq("content_type", "news_briefing")
    .single();

  if (!briefingRow) return { error: "No briefing found for today. Generate news first." };

  const briefing = briefingRow.content as NewsBriefingContent;
  const text = briefing.briefings
    .map((b) => `${b.topic}: ${b.summary}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: MODELS.gpt4oMini,
    messages: [
      {
        role: "system",
        content: `Generate 3-5 flashcards from the given text as a JSON array. Each item must have "front" (question) and "back" (answer) fields. Focus on key facts and concepts. Return only the JSON array.`,
      },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { error: "No response from AI" };

  let cards: { front: string; back: string }[];
  try {
    const parsed = JSON.parse(raw);
    cards = Array.isArray(parsed) ? parsed : parsed.flashcards || parsed.cards || [];
  } catch {
    return { error: "Failed to parse AI response" };
  }

  if (!cards.length) return { error: "No cards generated" };

  const deckId = await getOrCreateDailyDeck(supabase, user.id);
  if (!deckId) return { error: "Failed to create deck" };

  const today = new Date().toISOString().split("T")[0];
  const rows = cards.map((c) => ({
    deck_id: deckId,
    user_id: user.id,
    front: c.front,
    back: c.back,
    next_review_date: today,
  }));

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/learn");
  return { success: true, count: rows.length };
}

export async function getFlashcardStats(): Promise<{
  total: number;
  dueToday: number;
  mastered: number;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { total: 0, dueToday: 0, mastered: 0 };

  const today = new Date().toISOString().split("T")[0];

  const [{ count: total }, { count: dueToday }, { count: mastered }] = await Promise.all([
    supabase.from("flashcards").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("next_review_date", today),
    supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("interval_days", 21),
  ]);

  return {
    total: total || 0,
    dueToday: dueToday || 0,
    mastered: mastered || 0,
  };
}
