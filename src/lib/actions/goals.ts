"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
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
  const timezone = (formData.get("timezone") as string) || "America/New_York";

  const updates = {
    daily_calories_goal: parseInt(formData.get("daily_calories_goal") as string) || 2000,
    daily_protein_goal: parseInt(formData.get("daily_protein_goal") as string) || 150,
    daily_carbs_goal: parseInt(formData.get("daily_carbs_goal") as string) || 250,
    daily_fat_goal: parseInt(formData.get("daily_fat_goal") as string) || 65,
    goal_weight: goalWeightStr ? parseFloat(goalWeightStr) : null,
    timezone,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  cookies().set("timezone", timezone, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { success: true };
}

export async function updateBuiltinHabitGoal(
  field: "creatine_goal" | "gym_weekly_goal",
  value: number
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function updateBuiltinHabitLabel(
  type: "creatine" | "magnesium" | "gym",
  label: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ [`${type}_label`]: label || null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function toggleBuiltinHabitHidden(
  type: "creatine" | "magnesium" | "gym",
  hidden: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ [`${type}_hidden`]: hidden, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}
