"use server";

import { createClient } from "@/lib/supabase/server";
import { getDayRange } from "@/lib/utils";
import type { FoodEntry, Profile } from "@/types/database";

export type CalendarData = {
  entries: FoodEntry[];
  datesWithEntries: string[];
  caloriesByDay: Record<string, number>;
  profile: Profile | null;
};

export async function getCalendarData(
  year: number,
  month: number,
  date: string
): Promise<CalendarData> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: CalendarData = {
    entries: [],
    datesWithEntries: [],
    caloriesByDay: {},
    profile: null,
  };
  if (!user) return empty;

  const { start, end } = getDayRange(date);
  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd = new Date(year, month, 0, 23, 59, 59).toISOString();

  const [entriesResult, monthResult, profileResult] = await Promise.all([
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", start)
      .lte("logged_at", end)
      .order("logged_at", { ascending: true }),
    supabase
      .from("food_entries")
      .select("logged_at, calories")
      .eq("user_id", user.id)
      .gte("logged_at", monthStart)
      .lte("logged_at", monthEnd),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  const entries = (entriesResult.data as FoodEntry[]) || [];

  // Derive both datesWithEntries and caloriesByDay from the single month query
  const datesSet = new Set<string>();
  const caloriesByDay: Record<string, number> = {};
  for (const e of monthResult.data || []) {
    const day = new Date(e.logged_at).toISOString().split("T")[0];
    datesSet.add(day);
    caloriesByDay[day] = (caloriesByDay[day] || 0) + (e.calories || 0);
  }

  return {
    entries,
    datesWithEntries: Array.from(datesSet),
    caloriesByDay,
    profile: profileResult.data as Profile | null,
  };
}
