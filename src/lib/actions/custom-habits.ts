"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateHabitStreak } from "@/lib/actions/habits";
import type { CustomHabit, HabitEntry } from "@/types/database";

export async function getCustomHabits(): Promise<CustomHabit[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("custom_habits")
    .select("*")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching custom habits:", error);
    return [];
  }

  return (data as CustomHabit[]) || [];
}

export async function getAllCustomHabits(): Promise<CustomHabit[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("custom_habits")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching all custom habits:", error);
    return [];
  }

  return (data as CustomHabit[]) || [];
}

export async function createCustomHabit(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const name = formData.get("name") as string;
  const icon = (formData.get("icon") as string) || "✅";
  const tracking_type = (formData.get("tracking_type") as string) || "checkbox";
  const target_value = Number(formData.get("target_value")) || 1;
  const frequency = (formData.get("frequency") as string) || "daily";
  const frequency_days_raw = formData.get("frequency_days") as string;
  const category = (formData.get("category") as string) || null;

  if (!name?.trim()) return { error: "Name is required" };

  const frequency_days = frequency === "custom" && frequency_days_raw
    ? frequency_days_raw.split(",").map(Number)
    : null;

  // Auto-increment sort_order
  const { data: maxOrder } = await supabase
    .from("custom_habits")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sort_order = (maxOrder?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("custom_habits").insert({
    user_id: user.id,
    name: name.trim(),
    icon,
    tracking_type,
    target_value,
    frequency,
    frequency_days,
    category,
    sort_order,
  });

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function updateCustomHabit(
  habitId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Ownership check
  const { data: existing } = await supabase
    .from("custom_habits")
    .select("id")
    .eq("id", habitId)
    .eq("user_id", user.id)
    .single();

  if (!existing) return { error: "Habit not found" };

  const name = formData.get("name") as string;
  const icon = (formData.get("icon") as string) || "✅";
  const tracking_type = (formData.get("tracking_type") as string) || "checkbox";
  const target_value = Number(formData.get("target_value")) || 1;
  const frequency = (formData.get("frequency") as string) || "daily";
  const frequency_days_raw = formData.get("frequency_days") as string;
  const category = (formData.get("category") as string) || null;

  if (!name?.trim()) return { error: "Name is required" };

  const frequency_days = frequency === "custom" && frequency_days_raw
    ? frequency_days_raw.split(",").map(Number)
    : null;

  const { error } = await supabase
    .from("custom_habits")
    .update({
      name: name.trim(),
      icon,
      tracking_type,
      target_value,
      frequency,
      frequency_days,
      category,
      updated_at: new Date().toISOString(),
    })
    .eq("id", habitId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function archiveCustomHabit(
  habitId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("custom_habits")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", habitId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function unarchiveCustomHabit(
  habitId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("custom_habits")
    .update({ archived: false, updated_at: new Date().toISOString() })
    .eq("id", habitId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

export async function logCustomHabit(
  customHabitId: string,
  value: number,
  date?: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Ownership check
  const { data: habit } = await supabase
    .from("custom_habits")
    .select("id")
    .eq("id", customHabitId)
    .eq("user_id", user.id)
    .single();

  if (!habit) return { error: "Habit not found" };

  const loggedAt = date || new Date().toISOString().split("T")[0];

  // Check for existing entry to do upsert
  const { data: existingEntry } = await supabase
    .from("habit_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("custom_habit_id", customHabitId)
    .eq("logged_at", loggedAt)
    .single();

  if (existingEntry) {
    const { error } = await supabase
      .from("habit_entries")
      .update({ value })
      .eq("id", existingEntry.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("habit_entries").insert({
      user_id: user.id,
      habit_type: "custom",
      custom_habit_id: customHabitId,
      logged_at: loggedAt,
      value,
    });
    if (error) return { error: error.message };
  }

  await updateHabitStreak(user.id, `custom:${customHabitId}`, loggedAt, value, supabase);

  revalidatePath("/dashboard");
  return {};
}

export async function getTodayCustomHabitEntries(
  date?: string
): Promise<HabitEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const targetDate = date || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("habit_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("logged_at", targetDate)
    .not("custom_habit_id", "is", null);

  if (error) {
    console.error("Error fetching custom habit entries:", error);
    return [];
  }

  return (data as HabitEntry[]) || [];
}
