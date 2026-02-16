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
