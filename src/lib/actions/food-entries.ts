"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDayRange } from "@/lib/utils";
import { getNow } from "@/lib/timezone";
import type { FoodEntry } from "@/types/database";
import { deletePhoto } from "./storage";
import { updateStreaks, checkAndUnlockAchievements } from "./achievements";

export async function getFoodEntries(date: string): Promise<FoodEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { start, end } = getDayRange(date);

  const { data, error } = await supabase
    .from("food_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", start)
    .lte("logged_at", end)
    .order("logged_at", { ascending: true });

  if (error) {
    console.error("Error fetching food entries:", error);
    return [];
  }

  return data as FoodEntry[];
}

export async function createFoodEntry(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const costStr = formData.get("cost") as string;
  const mealSource = formData.get("meal_source") as string;

  const entry = {
    user_id: user.id,
    name: formData.get("name") as string,
    calories: parseInt(formData.get("calories") as string) || 0,
    protein: parseFloat(formData.get("protein") as string) || 0,
    carbs: parseFloat(formData.get("carbs") as string) || 0,
    fat: parseFloat(formData.get("fat") as string) || 0,
    meal_category: formData.get("meal_category") as string,
    photo_url: (formData.get("photo_url") as string) || null,
    logged_at: (formData.get("logged_at") as string) || getNow().toISOString(),
    cost: costStr ? parseFloat(costStr) : null,
    meal_source: mealSource || null,
  };

  const { error } = await supabase.from("food_entries").insert(entry);

  if (error) {
    return { error: error.message };
  }

  // Update streaks and check achievements in parallel (fire-and-forget)
  Promise.all([updateStreaks(), checkAndUnlockAchievements()]).catch(console.error);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateFoodEntry(id: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const costStr = formData.get("cost") as string;
  const mealSource = formData.get("meal_source") as string;

  const updates = {
    name: formData.get("name") as string,
    calories: parseInt(formData.get("calories") as string) || 0,
    protein: parseFloat(formData.get("protein") as string) || 0,
    carbs: parseFloat(formData.get("carbs") as string) || 0,
    fat: parseFloat(formData.get("fat") as string) || 0,
    meal_category: formData.get("meal_category") as string,
    photo_url: (formData.get("photo_url") as string) || null,
    cost: costStr ? parseFloat(costStr) : null,
    meal_source: mealSource || null,
  };

  const { error } = await supabase
    .from("food_entries")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteFoodEntry(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Get entry to check for photo
  const { data: entry } = await supabase
    .from("food_entries")
    .select("photo_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (entry?.photo_url) {
    await deletePhoto(entry.photo_url);
  }

  const { error } = await supabase
    .from("food_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function getEntriesForMonth(year: number, month: number) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from("food_entries")
    .select("logged_at")
    .eq("user_id", user.id)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  if (error) {
    console.error("Error fetching monthly entries:", error);
    return [];
  }

  // Return unique dates that have entries
  const dates = new Set(
    data.map((entry: { logged_at: string }) =>
      new Date(entry.logged_at).toISOString().split("T")[0]
    )
  );

  return Array.from(dates);
}

export async function getMonthCaloriesByDay(
  year: number,
  month: number
): Promise<Record<string, number>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from("food_entries")
    .select("logged_at, calories")
    .eq("user_id", user.id)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  if (error) {
    console.error("Error fetching monthly calories:", error);
    return {};
  }

  const byDay: Record<string, number> = {};
  for (const entry of data || []) {
    const day = new Date(entry.logged_at).toISOString().split("T")[0];
    byDay[day] = (byDay[day] || 0) + (entry.calories || 0);
  }

  return byDay;
}
