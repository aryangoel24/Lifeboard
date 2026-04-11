import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getFoodSummary,
  getHabitSummary,
  getWeightTrend,
  getBudgetData,
  getStreaks,
  getTodayFoodSummary,
  getProfile,
} from "@/lib/services/chat-data";
import { getToday, getStartOfWeek } from "@/lib/timezone";

export type UserInsights = {
  tdee_estimate: number | null;
  avg_calories_7d: number;
  days_over_goal_7d: number;
  protein_adherence: number;
  gym_rate_30d: number;
  late_night_eating_frequency: number;
  top_foods: string[];
  weight_trend: "increasing" | "decreasing" | "stable" | "insufficient_data";
  weight_rate_lbs_per_week: number | null;
  current_weight: number | null;
  budget_spend_this_week: number;
  budget_remaining: number | null;
  streak_logging: number;
  streak_gym: number;
  calorie_goal: number;
  protein_goal: number;
  today_calories: number;
  today_protein: number;
};

export async function computeInsights(
  supabase: SupabaseClient,
  userId: string
): Promise<UserInsights> {
  const [profile, food7d, habits30d, weight30d, streaks] = await Promise.all([
    getProfile(supabase, userId),
    getFoodSummary(supabase, userId, 7),
    getHabitSummary(supabase, userId, 30),
    getWeightTrend(supabase, userId, 30),
    getStreaks(supabase, userId),
  ]);

  const timezone = profile?.timezone ?? "UTC";
  const [budget, todayFood] = await Promise.all([
    getBudgetData(supabase, userId, getStartOfWeek(), getToday()),
    getTodayFoodSummary(supabase, userId, timezone),
  ]);

  const calorieGoal = profile?.daily_calories_goal ?? 2000;
  const proteinGoal = profile?.daily_protein_goal ?? 150;

  // Protein adherence: avg_protein / goal
  const proteinAdherence =
    proteinGoal > 0
      ? Math.round((food7d.avg_protein / proteinGoal) * 100) / 100
      : 0;

  // TDEE estimate: if weight is stable, TDEE ≈ avg calories
  let tdeeEstimate: number | null = null;
  if (weight30d.trend === "stable" && food7d.avg_calories > 0) {
    tdeeEstimate = food7d.avg_calories;
  } else if (weight30d.trend === "increasing" && weight30d.rate_lbs_per_week !== null) {
    // Approximately 500 cal surplus per lb/week
    tdeeEstimate = Math.round(food7d.avg_calories - weight30d.rate_lbs_per_week * 500);
  } else if (weight30d.trend === "decreasing" && weight30d.rate_lbs_per_week !== null) {
    tdeeEstimate = Math.round(food7d.avg_calories + Math.abs(weight30d.rate_lbs_per_week) * 500);
  }

  return {
    tdee_estimate: tdeeEstimate,
    avg_calories_7d: food7d.avg_calories,
    days_over_goal_7d: 0, // Would need day-level data; simplified
    protein_adherence: proteinAdherence,
    gym_rate_30d: habits30d.gym_rate,
    late_night_eating_frequency: 0, // Would need hour-level filtering; simplified
    top_foods: food7d.top_foods,
    weight_trend: weight30d.trend,
    weight_rate_lbs_per_week: weight30d.rate_lbs_per_week,
    current_weight: weight30d.current_weight,
    budget_spend_this_week: budget.total_spent,
    budget_remaining: budget.budget_remaining,
    streak_logging: streaks.logging_streak,
    streak_gym: streaks.gym_streak,
    calorie_goal: calorieGoal,
    protein_goal: proteinGoal,
    today_calories: todayFood.total_calories,
    today_protein: todayFood.total_protein,
  };
}
