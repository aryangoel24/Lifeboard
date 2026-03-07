import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDayRange } from "@/lib/utils";
import type { Recipe } from "@/types/database";

export interface PendingSessionData {
  // Common
  original_text?: string;
  source?: "recipe" | "ai" | "expense" | "pantry";

  // Specific to Food
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  meal_category?: "breakfast" | "lunch" | "dinner" | "snack";
  photo_path?: string;
  recipe_id?: string;

  // Specific to Expense
  amount?: number;
  merchant?: string;
  expense_category?: string;
  description?: string;

  // Specific to Pantry
  pantry_name?: string;
  pantry_category?: string;
  assumed_size?: string;
}

export interface TodaySummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export async function getUserByChatId(
  chatId: string
): Promise<{ id: string; timezone: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, timezone")
    .eq("telegram_chat_id", chatId)
    .single();

  if (error || !data) return null;
  return data as { id: string; timezone: string };
}

export async function linkTelegramAccount(
  apiToken: string,
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiToken.trim()) {
    return { success: false, error: "No token provided" };
  }

  const tokenHash = createHash("sha256").update(apiToken.trim()).digest("hex");

  const supabase = createAdminClient();
  const { data: profile, error: findError } = await supabase
    .from("profiles")
    .select("id, api_enabled")
    .eq("api_token_hash", tokenHash)
    .single();

  if (findError || !profile) {
    return { success: false, error: "Invalid token. Generate one from the Goals page." };
  }

  if (!profile.api_enabled) {
    return { success: false, error: "API access is disabled for this account. Enable it in Goals." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ telegram_chat_id: chatId })
    .eq("id", profile.id);

  if (updateError) {
    console.error("Failed to link Telegram account:", updateError);
    return { success: false, error: "Failed to link account. Please try again." };
  }

  return { success: true };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

export function findRecipeMatch(recipes: Recipe[], messageText: string): Recipe | null {
  const msgWords = normalize(messageText).split(/\s+/);
  let bestMatch: Recipe | null = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    const recipeWords = normalize(recipe.name).split(/\s+/);
    const overlap = recipeWords.filter((w) => msgWords.includes(w)).length;
    const score = overlap / recipeWords.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = recipe;
    }
  }

  return bestMatch;
}

export async function fetchUserRecipes(userId: string): Promise<Recipe[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("id, user_id, name, servings, total_calories, total_protein, total_carbs, total_fat, prep_time_minutes, photo_url, tags, created_at, updated_at")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data as Recipe[];
}

export async function savePendingSession(
  userId: string,
  chatId: string,
  data: PendingSessionData
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: session, error } = await supabase
    .from("telegram_sessions")
    .insert({ user_id: userId, chat_id: chatId, data })
    .select("id")
    .single();

  if (error || !session) {
    console.error("Failed to save pending session:", error);
    return null;
  }

  return session.id as string;
}

export async function getPendingSession(
  sessionId: string
): Promise<{ user_id: string; chat_id: string; data: PendingSessionData } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("telegram_sessions")
    .select("user_id, chat_id, data")
    .eq("id", sessionId)
    .single();

  if (error || !data) return null;
  return data as { user_id: string; chat_id: string; data: PendingSessionData };
}

export async function deletePendingSession(sessionId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("telegram_sessions").delete().eq("id", sessionId);
}

export async function getTodaySummary(userId: string): Promise<TodaySummary | null> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const { start, end } = getDayRange(today);

  const [entriesResult, profileResult] = await Promise.all([
    supabase
      .from("food_entries")
      .select("calories, protein, carbs, fat")
      .eq("user_id", userId)
      .gte("logged_at", start)
      .lte("logged_at", end),
    supabase
      .from("profiles")
      .select("daily_calories_goal, daily_protein_goal, daily_carbs_goal, daily_fat_goal")
      .eq("id", userId)
      .single(),
  ]);

  if (profileResult.error || !profileResult.data) return null;

  const entries = entriesResult.data || [];
  const totals = entries.reduce(
    (acc: { calories: number; protein: number; carbs: number; fat: number }, e: { calories: number; protein: number; carbs: number; fat: number }) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const profile = profileResult.data;
  return {
    ...totals,
    goals: {
      calories: profile.daily_calories_goal,
      protein: profile.daily_protein_goal,
      carbs: profile.daily_carbs_goal,
      fat: profile.daily_fat_goal,
    },
  };
}
