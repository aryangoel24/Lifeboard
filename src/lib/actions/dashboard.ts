"use server";

import { createClient } from "@/lib/supabase/server";
import { getDayRange } from "@/lib/utils";
import { getNow } from "@/lib/timezone";
import type {
  FoodEntry,
  Profile,
  UserStreak,
  MealTemplate,
  WeightEntry,
  HabitEntry,
  CustomHabit,
  StepEntry,
  HabitDebt,
} from "@/types/database";
import type { DebtState } from "@/lib/actions/habit-debt";

export type DashboardData = {
  entries: FoodEntry[];
  profile: Profile | null;
  streaks: UserStreak[];
  templates: MealTemplate[];
  recentWeights: WeightEntry[];
  todayHabits: HabitEntry[];
  customHabits: CustomHabit[];
  customHabitEntries: HabitEntry[];
  weeklyHabitEntries: HabitEntry[];
  weeklyCustomHabitEntries: HabitEntry[];
  todaySteps: StepEntry | null;
  debtState: DebtState;
};

const EMPTY: DashboardData = {
  entries: [],
  profile: null,
  streaks: [],
  templates: [],
  recentWeights: [],
  todayHabits: [],
  customHabits: [],
  customHabitEntries: [],
  weeklyHabitEntries: [],
  weeklyCustomHabitEntries: [],
  todaySteps: null,
  debtState: { debts: [], currentWeekTotalCents: 0, totalDebtCents: 0 },
};

export async function getDashboardData(date: string): Promise<DashboardData> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return EMPTY;

  const { start, end } = getDayRange(date);

  const sevenDaysAgo = getNow();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const [
    foodResult,
    profileResult,
    streaksResult,
    templatesResult,
    weightResult,
    builtinHabitResult,
    customHabitsResult,
    customHabitEntriesResult,
    weeklyBuiltinResult,
    weeklyCustomResult,
    stepsResult,
    debtRowsResult,
    debtMetaResult,
  ] = await Promise.all([
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", start)
      .lte("logged_at", end)
      .order("logged_at", { ascending: true }),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_streaks").select("*").eq("user_id", user.id),
    supabase
      .from("meal_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("use_count", { ascending: false }),
    supabase
      .from("weight_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", sevenDaysAgoStr)
      .order("logged_at", { ascending: true }),
    supabase
      .from("habit_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("logged_at", date)
      .is("custom_habit_id", null),
    supabase
      .from("custom_habits")
      .select("*")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("habit_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("logged_at", date)
      .not("custom_habit_id", "is", null),
    supabase
      .from("habit_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", sevenDaysAgoStr)
      .is("custom_habit_id", null)
      .order("logged_at", { ascending: true }),
    supabase
      .from("habit_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", sevenDaysAgoStr)
      .not("custom_habit_id", "is", null)
      .order("logged_at", { ascending: true }),
    supabase
      .from("step_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("logged_at", date)
      .maybeSingle(),
    supabase.from("habit_debt").select("*").eq("user_id", user.id),
    supabase.from("habit_debt_meta").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const debts = (debtRowsResult.data as HabitDebt[]) || [];
  const currentWeekTotalCents = debts.reduce(
    (sum, d) => sum + (d.current_week_unpaid_cents || 0),
    0
  );
  const totalDebtCents = debtMetaResult.data?.total_debt_cents ?? 0;

  return {
    entries: (foodResult.data as FoodEntry[]) || [],
    profile: profileResult.data as Profile | null,
    streaks: (streaksResult.data as UserStreak[]) || [],
    templates: (templatesResult.data as MealTemplate[]) || [],
    recentWeights: (weightResult.data as WeightEntry[]) || [],
    todayHabits: (builtinHabitResult.data as HabitEntry[]) || [],
    customHabits: (customHabitsResult.data as CustomHabit[]) || [],
    customHabitEntries: (customHabitEntriesResult.data as HabitEntry[]) || [],
    weeklyHabitEntries: (weeklyBuiltinResult.data as HabitEntry[]) || [],
    weeklyCustomHabitEntries: (weeklyCustomResult.data as HabitEntry[]) || [],
    todaySteps: stepsResult.data as StepEntry | null,
    debtState: { debts, currentWeekTotalCents, totalDebtCents },
  };
}
