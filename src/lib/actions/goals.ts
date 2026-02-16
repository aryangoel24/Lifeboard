"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data as Profile | null;
}

export async function getGoalAchievementRate(
  days: number = 30
): Promise<{ daysHitCalories: number; daysHitProtein: number; totalDays: number }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { daysHitCalories: 0, daysHitProtein: 0, totalDays: 0 };

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [entriesResult, profileResult] = await Promise.all([
    supabase
      .from("food_entries")
      .select("calories, protein, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", startDate.toISOString()),
    supabase.from("profiles").select("daily_calories_goal, daily_protein_goal").eq("id", user.id).single(),
  ]);

  const profile = profileResult.data;
  if (!profile || !entriesResult.data) return { daysHitCalories: 0, daysHitProtein: 0, totalDays: 0 };

  // Aggregate by day
  const byDay: Record<string, { calories: number; protein: number }> = {};
  for (const entry of entriesResult.data) {
    const day = new Date(entry.logged_at).toISOString().split("T")[0];
    if (!byDay[day]) byDay[day] = { calories: 0, protein: 0 };
    byDay[day].calories += entry.calories || 0;
    byDay[day].protein += Number(entry.protein) || 0;
  }

  const totalDays = Object.keys(byDay).length;
  let daysHitCalories = 0;
  let daysHitProtein = 0;

  for (const day of Object.values(byDay)) {
    if (day.calories >= profile.daily_calories_goal * 0.8 && day.calories <= profile.daily_calories_goal * 1.1) {
      daysHitCalories++;
    }
    if (day.protein >= profile.daily_protein_goal * 0.9) {
      daysHitProtein++;
    }
  }

  return { daysHitCalories, daysHitProtein, totalDays };
}

export async function updateGoals(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const goalWeightStr = formData.get("goal_weight") as string;

  const updates = {
    daily_calories_goal: parseInt(formData.get("daily_calories_goal") as string) || 2000,
    daily_protein_goal: parseInt(formData.get("daily_protein_goal") as string) || 150,
    daily_carbs_goal: parseInt(formData.get("daily_carbs_goal") as string) || 250,
    daily_fat_goal: parseInt(formData.get("daily_fat_goal") as string) || 65,
    goal_weight: goalWeightStr ? parseFloat(goalWeightStr) : null,
    creatine_goal: parseInt(formData.get("creatine_goal") as string) || 2,
    gym_weekly_goal: parseInt(formData.get("gym_weekly_goal") as string) || 5,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true };
}
