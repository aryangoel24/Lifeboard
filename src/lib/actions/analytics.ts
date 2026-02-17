"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, format, startOfDay, endOfDay, parseISO } from "date-fns";
import { getNow } from "@/lib/timezone";
import type { WeightEntry, HabitEntry } from "@/types/database";
import type { WeightStats, WeightCalorieData, TDEEResponse } from "@/lib/weight-utils";
import { computeWeightStats, computeWeightCalorieCorrelation, computeTDEE } from "@/lib/weight-utils";
import type { HabitWeeklyStats } from "@/lib/habit-utils";
import { computeHabitWeeklyStats, computeDailyHabitData } from "@/lib/habit-utils";
import type { DailyHabitData } from "@/lib/habit-utils";

export type DailyMacroData = {
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    entryCount: number;
};

export type MealBreakdown = {
    category: string;
    calories: number;
    percentage: number;
};

export async function getMacroTrends(days: number = 30, today?: string): Promise<DailyMacroData[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const endDate = today ? parseISO(today) : getNow();
    const startDate = subDays(endDate, days - 1);

    const { data: entries } = await supabase
        .from("food_entries")
        .select("calories, protein, carbs, fat, logged_at")
        .eq("user_id", user.id)
        .gte("logged_at", startOfDay(startDate).toISOString())
        .lte("logged_at", endOfDay(endDate).toISOString())
        .order("logged_at", { ascending: true });

    if (!entries || entries.length === 0) return [];

    // Aggregate by day
    const dailyMap = new Map<string, DailyMacroData>();

    // Initialize all days
    for (let i = 0; i < days; i++) {
        const d = subDays(endDate, days - 1 - i);
        const dateStr = format(d, "yyyy-MM-dd");
        dailyMap.set(dateStr, {
            date: dateStr,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            entryCount: 0,
        });
    }

    for (const entry of entries) {
        const dateStr = entry.logged_at.split("T")[0];
        const day = dailyMap.get(dateStr);
        if (day) {
            day.calories += entry.calories || 0;
            day.protein += Number(entry.protein) || 0;
            day.carbs += Number(entry.carbs) || 0;
            day.fat += Number(entry.fat) || 0;
            day.entryCount += 1;
        }
    }

    return Array.from(dailyMap.values());
}

export async function getMealBreakdown(date: string): Promise<MealBreakdown[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const dayStart = startOfDay(new Date(date + "T00:00:00")).toISOString();
    const dayEnd = endOfDay(new Date(date + "T00:00:00")).toISOString();

    const { data: entries } = await supabase
        .from("food_entries")
        .select("meal_category, calories")
        .eq("user_id", user.id)
        .gte("logged_at", dayStart)
        .lte("logged_at", dayEnd);

    if (!entries || entries.length === 0) return [];

    const categoryMap = new Map<string, number>();
    let total = 0;

    for (const entry of entries) {
        const cat = entry.meal_category || "snack";
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + (entry.calories || 0));
        total += entry.calories || 0;
    }

    return Array.from(categoryMap.entries()).map(([category, calories]) => ({
        category,
        calories,
        percentage: total > 0 ? Math.round((calories / total) * 100) : 0,
    }));
}

export async function getWeeklySummary(today?: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const endDate = today ? parseISO(today) : getNow();
    const startDate = subDays(endDate, 6);

    const { data: entries } = await supabase
        .from("food_entries")
        .select("calories, protein, carbs, fat, logged_at")
        .eq("user_id", user.id)
        .gte("logged_at", startOfDay(startDate).toISOString())
        .lte("logged_at", endOfDay(endDate).toISOString());

    if (!entries || entries.length === 0) {
        return {
            avgCalories: 0,
            avgProtein: 0,
            avgCarbs: 0,
            avgFat: 0,
            totalEntries: 0,
            daysLogged: 0,
            bestDay: null as string | null,
            worstDay: null as string | null,
        };
    }

    // Aggregate by day
    const dailyCalories = new Map<string, number>();
    for (const entry of entries) {
        const dateStr = entry.logged_at.split("T")[0];
        dailyCalories.set(dateStr, (dailyCalories.get(dateStr) || 0) + (entry.calories || 0));
    }

    const daysLogged = dailyCalories.size;
    const totalCalories = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
    const totalProtein = entries.reduce((sum, e) => sum + (Number(e.protein) || 0), 0);
    const totalCarbs = entries.reduce((sum, e) => sum + (Number(e.carbs) || 0), 0);
    const totalFat = entries.reduce((sum, e) => sum + (Number(e.fat) || 0), 0);

    // Find best/worst days (closest to average vs furthest)
    let bestDay: string | null = null;
    let worstDay: string | null = null;
    let minCals = Infinity;
    let maxCals = 0;

    const dailyEntries = Array.from(dailyCalories.entries());
    for (const [date, cals] of dailyEntries) {
        if (cals < minCals) {
            minCals = cals;
            worstDay = date;
        }
        if (cals > maxCals) {
            maxCals = cals;
            bestDay = date;
        }
    }

    return {
        avgCalories: Math.round(totalCalories / daysLogged),
        avgProtein: Math.round(totalProtein / daysLogged),
        avgCarbs: Math.round(totalCarbs / daysLogged),
        avgFat: Math.round(totalFat / daysLogged),
        totalEntries: entries.length,
        daysLogged,
        bestDay,
        worstDay,
    };
}

export interface AnalyticsData {
    trends: DailyMacroData[];
    weeklySummary: {
        avgCalories: number;
        avgProtein: number;
        avgCarbs: number;
        avgFat: number;
        totalEntries: number;
        daysLogged: number;
        bestDay: string | null;
        worstDay: string | null;
    } | null;
    mealBreakdown: MealBreakdown[];
    weightEntries: WeightEntry[];
    weightStats: WeightStats;
    weightCalories: WeightCalorieData[];
    tdee: TDEEResponse;
    habitEntries: HabitEntry[];
    habitWeeklyStats: HabitWeeklyStats;
    habitDailyData: DailyHabitData[];
}

export async function getAnalyticsData(today?: string): Promise<AnalyticsData> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const emptyResult: AnalyticsData = {
        trends: [],
        weeklySummary: null,
        mealBreakdown: [],
        weightEntries: [],
        weightStats: computeWeightStats([]),
        weightCalories: [],
        tdee: { status: "insufficient", progress: { weightDays: 0, calorieDays: 0, bothDays: 0, requiredDays: 14 } },
        habitEntries: [],
        habitWeeklyStats: { creatineCompletionPct: 0, magnesiumCompletionPct: 0, gymDays: 0, gymGoal: 5, totalDays: 7 },
        habitDailyData: [],
    };

    if (!user) return emptyResult;

    const now = today ? parseISO(today) : getNow();
    const thirtyDaysAgo = subDays(now, 29);
    const ninetyDaysAgo = subDays(now, 90);

    // 4 parallel DB queries
    const [foodResult, weightResult, profileResult, habitResult] = await Promise.all([
        supabase
            .from("food_entries")
            .select("calories, protein, carbs, fat, meal_category, logged_at")
            .eq("user_id", user.id)
            .gte("logged_at", startOfDay(thirtyDaysAgo).toISOString())
            .lte("logged_at", endOfDay(now).toISOString())
            .order("logged_at", { ascending: true }),
        supabase
            .from("weight_entries")
            .select("*")
            .eq("user_id", user.id)
            .gte("logged_at", ninetyDaysAgo.toISOString().split("T")[0])
            .order("logged_at", { ascending: true }),
        supabase
            .from("profiles")
            .select("goal_weight, creatine_goal, gym_weekly_goal")
            .eq("id", user.id)
            .single(),
        supabase
            .from("habit_entries")
            .select("*")
            .eq("user_id", user.id)
            .gte("logged_at", thirtyDaysAgo.toISOString().split("T")[0])
            .order("logged_at", { ascending: true }),
    ]);

    const foodEntries = foodResult.data || [];
    const weightEntries = (weightResult.data as WeightEntry[]) || [];

    // === Derive macro trends (30 days) ===
    const dailyMap = new Map<string, DailyMacroData>();
    for (let i = 0; i < 30; i++) {
        const d = subDays(now, 29 - i);
        const dateStr = format(d, "yyyy-MM-dd");
        dailyMap.set(dateStr, {
            date: dateStr,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            entryCount: 0,
        });
    }
    for (const entry of foodEntries) {
        const dateStr = entry.logged_at.split("T")[0];
        const day = dailyMap.get(dateStr);
        if (day) {
            day.calories += entry.calories || 0;
            day.protein += Number(entry.protein) || 0;
            day.carbs += Number(entry.carbs) || 0;
            day.fat += Number(entry.fat) || 0;
            day.entryCount += 1;
        }
    }
    const trends = Array.from(dailyMap.values());

    // === Derive weekly summary (last 7 days subset) ===
    const weekStart = subDays(now, 6);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEntries = foodEntries.filter((e) => e.logged_at.split("T")[0] >= weekStartStr);

    let weeklySummary: AnalyticsData["weeklySummary"] = null;
    if (weekEntries.length > 0) {
        const dailyCalories = new Map<string, number>();
        for (const entry of weekEntries) {
            const dateStr = entry.logged_at.split("T")[0];
            dailyCalories.set(dateStr, (dailyCalories.get(dateStr) || 0) + (entry.calories || 0));
        }

        const daysLogged = dailyCalories.size;
        const totalCalories = weekEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
        const totalProtein = weekEntries.reduce((sum, e) => sum + (Number(e.protein) || 0), 0);
        const totalCarbs = weekEntries.reduce((sum, e) => sum + (Number(e.carbs) || 0), 0);
        const totalFat = weekEntries.reduce((sum, e) => sum + (Number(e.fat) || 0), 0);

        let bestDay: string | null = null;
        let worstDay: string | null = null;
        let minCals = Infinity;
        let maxCals = 0;
        for (const [date, cals] of Array.from(dailyCalories.entries())) {
            if (cals < minCals) { minCals = cals; worstDay = date; }
            if (cals > maxCals) { maxCals = cals; bestDay = date; }
        }

        weeklySummary = {
            avgCalories: Math.round(totalCalories / daysLogged),
            avgProtein: Math.round(totalProtein / daysLogged),
            avgCarbs: Math.round(totalCarbs / daysLogged),
            avgFat: Math.round(totalFat / daysLogged),
            totalEntries: weekEntries.length,
            daysLogged,
            bestDay,
            worstDay,
        };
    }

    // === Derive meal breakdown (today) ===
    const todayStr = format(now, "yyyy-MM-dd");
    const todayEntries = foodEntries.filter((e) => e.logged_at.split("T")[0] === todayStr);
    const categoryMap = new Map<string, number>();
    let total = 0;
    for (const entry of todayEntries) {
        const cat = entry.meal_category || "snack";
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + (entry.calories || 0));
        total += entry.calories || 0;
    }
    const mealBreakdown = Array.from(categoryMap.entries()).map(([category, calories]) => ({
        category,
        calories,
        percentage: total > 0 ? Math.round((calories / total) * 100) : 0,
    }));

    // === Derive weight stats (from 90-day weight data) ===
    const weightStats = computeWeightStats(weightEntries);

    // === Derive weight-calorie correlation (30-day window) ===
    const weightCalories = computeWeightCalorieCorrelation(
        weightEntries.map((e) => ({ weight: e.weight, logged_at: e.logged_at })),
        foodEntries.map((e) => ({ calories: e.calories, logged_at: e.logged_at })),
        30
    );

    // === Derive TDEE (uses 28-day window internally) ===
    const tdee = computeTDEE(
        weightEntries.map((e) => ({ weight: e.weight, logged_at: e.logged_at })),
        foodEntries.map((e) => ({ calories: e.calories, logged_at: e.logged_at })),
        profileResult.data?.goal_weight as number | null
    );

    // === Derive habit stats ===
    const habitEntries = (habitResult.data as HabitEntry[]) || [];
    const creatineGoal = (profileResult.data?.creatine_goal as number) ?? 2;
    const gymWeeklyGoal = (profileResult.data?.gym_weekly_goal as number) ?? 5;

    // Weekly stats from last 7 days of habit data
    const weekHabitEntries = habitEntries.filter(
        (e) => e.logged_at >= format(subDays(now, 6), "yyyy-MM-dd")
    );
    const habitWeeklyStats = computeHabitWeeklyStats(weekHabitEntries, creatineGoal, gymWeeklyGoal);
    const habitDailyData = computeDailyHabitData(habitEntries, 30);

    return {
        trends,
        weeklySummary,
        mealBreakdown,
        weightEntries,
        weightStats,
        weightCalories,
        tdee,
        habitEntries,
        habitWeeklyStats,
        habitDailyData,
    };
}

export async function exportEntriesCsv(startDate: string, endDate: string): Promise<string> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return "";

    const { data: entries } = await supabase
        .from("food_entries")
        .select("name, calories, protein, carbs, fat, meal_category, logged_at, cost, meal_source")
        .eq("user_id", user.id)
        .gte("logged_at", startDate)
        .lte("logged_at", endDate)
        .order("logged_at", { ascending: true });

    if (!entries || entries.length === 0) return "";

    const headers = "Date,Name,Meal,Calories,Protein (g),Carbs (g),Fat (g),Cost,Source\n";
    const rows = entries.map((e) => {
        const date = e.logged_at.split("T")[0];
        return `${date},"${e.name}",${e.meal_category},${e.calories},${e.protein},${e.carbs},${e.fat},${e.cost || ""},${e.meal_source || ""}`;
    });

    return headers + rows.join("\n");
}
