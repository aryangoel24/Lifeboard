"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateHabitStreak } from "@/lib/actions/habits";
import { getToday, getNow } from "@/lib/timezone";
import type { CustomHabit, HabitEntry } from "@/types/database";
import { suggestHabitIcon } from "@/lib/ai-utils";
import { parseCustomHabitFormData } from "@/lib/habit-utils";

export async function generateHabitIcon(
  name: string
): Promise<{ icon?: string; error?: string }> {
  const { icon, error } = await suggestHabitIcon(name);
  if (error || !icon) return { error: error ?? "No icon returned" };
  return { icon };
}

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

  const fields = parseCustomHabitFormData(formData);

  if (!fields.name?.trim()) return { error: "Name is required" };

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
    name: fields.name.trim(),
    icon: fields.icon,
    tracking_type: fields.tracking_type,
    target_value: fields.target_value,
    frequency: fields.frequency,
    frequency_days: fields.frequency_days,
    category: fields.category,
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

  const fields = parseCustomHabitFormData(formData);

  if (!fields.name?.trim()) return { error: "Name is required" };

  const { error } = await supabase
    .from("custom_habits")
    .update({
      name: fields.name.trim(),
      icon: fields.icon,
      tracking_type: fields.tracking_type,
      target_value: fields.target_value,
      frequency: fields.frequency,
      frequency_days: fields.frequency_days,
      category: fields.category,
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
    .select("id, nr_enabled, tracking_type, target_value, frequency, frequency_days")
    .eq("id", customHabitId)
    .eq("user_id", user.id)
    .single();

  if (!habit) return { error: "Habit not found" };

  const loggedAt = date || getToday();

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

export async function getCustomHabitEntries(
  days: number = 7
): Promise<HabitEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const startDate = getNow();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from("habit_entries")
    .select("*")
    .eq("user_id", user.id)
    .not("custom_habit_id", "is", null)
    .gte("logged_at", startDate.toISOString().split("T")[0])
    .order("logged_at", { ascending: true });

  if (error) {
    console.error("Error fetching custom habit entries:", error);
    return [];
  }

  return (data as HabitEntry[]) || [];
}

export async function getTodayCustomHabitEntries(
  date?: string
): Promise<HabitEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const targetDate = date || getToday();

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
