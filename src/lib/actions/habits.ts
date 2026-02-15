"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { HabitEntry, HabitType } from "@/types/database";

export async function logHabit(
  habitType: HabitType,
  value: number,
  date?: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const loggedAt = date || new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("habit_entries")
    .upsert(
      {
        user_id: user.id,
        habit_type: habitType,
        logged_at: loggedAt,
        value,
      },
      { onConflict: "user_id,habit_type,logged_at" }
    );

  if (error) return { error: error.message };

  // Update streak
  await updateHabitStreak(user.id, habitType, loggedAt, value);

  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return {};
}

export async function getTodayHabits(date?: string): Promise<HabitEntry[]> {
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
    .eq("logged_at", targetDate);

  if (error) {
    console.error("Error fetching habit entries:", error);
    return [];
  }

  return (data as HabitEntry[]) || [];
}

export async function getHabitEntries(days: number = 30): Promise<HabitEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from("habit_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", startDate.toISOString().split("T")[0])
    .order("logged_at", { ascending: true });

  if (error) {
    console.error("Error fetching habit entries:", error);
    return [];
  }

  return (data as HabitEntry[]) || [];
}

async function updateHabitStreak(
  userId: string,
  habitType: HabitType,
  loggedAt: string,
  value: number
) {
  // Only count as "done" if value > 0
  if (value <= 0) return;

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("user_streaks")
    .select("*")
    .eq("user_id", userId)
    .eq("streak_type", habitType)
    .single();

  const today = loggedAt;
  const yesterday = new Date(new Date(loggedAt).getTime() - 86400000)
    .toISOString()
    .split("T")[0];

  if (existing) {
    let newCount = existing.current_count;

    if (existing.last_logged_date === today) {
      // Already logged today, no change
      return;
    } else if (existing.last_logged_date === yesterday) {
      newCount = existing.current_count + 1;
    } else {
      newCount = 1;
    }

    const longestCount = Math.max(existing.longest_count, newCount);

    await supabase
      .from("user_streaks")
      .update({
        current_count: newCount,
        longest_count: longestCount,
        last_logged_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_streaks").insert({
      user_id: userId,
      streak_type: habitType,
      current_count: 1,
      longest_count: 1,
      last_logged_date: today,
    });
  }
}
