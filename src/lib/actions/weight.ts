"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WeightEntry } from "@/types/database";

export async function logWeight(
    weight: number,
    date?: string,
    notes?: string
): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const loggedAt = date || new Date().toISOString().split("T")[0];

    // Upsert: update if entry exists for this date, else insert
    const { error } = await supabase
        .from("weight_entries")
        .upsert(
            {
                user_id: user.id,
                weight,
                logged_at: loggedAt,
                notes: notes || null,
            },
            { onConflict: "user_id,logged_at" }
        );

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    revalidatePath("/analytics");
    return {};
}

export async function deleteWeightEntry(id: string): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("weight_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    revalidatePath("/analytics");
    return {};
}

export async function getWeightEntries(days: number = 30): Promise<WeightEntry[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("logged_at", startDate.toISOString().split("T")[0])
        .order("logged_at", { ascending: true });

    if (error) {
        console.error("Error fetching weight entries:", error);
        return [];
    }

    return (data as WeightEntry[]) || [];
}

export async function getTodayWeight(date?: string): Promise<WeightEntry | null> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const targetDate = date || new Date().toISOString().split("T")[0];

    const { data } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("logged_at", targetDate)
        .single();

    return (data as WeightEntry) || null;
}

export interface WeightStats {
    current: number | null;
    weekChange: number | null;
    monthChange: number | null;
    lowest: number | null;
    highest: number | null;
    avgCaloriesOnGainDays: number | null;
    avgCaloriesOnLossDays: number | null;
}

export async function getWeightStats(): Promise<WeightStats> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const empty: WeightStats = {
        current: null,
        weekChange: null,
        monthChange: null,
        lowest: null,
        highest: null,
        avgCaloriesOnGainDays: null,
        avgCaloriesOnLossDays: null,
    };

    if (!user) return empty;

    // Get all entries for the last 90 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const { data: entries } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("logged_at", startDate.toISOString().split("T")[0])
        .order("logged_at", { ascending: true });

    if (!entries || entries.length === 0) return empty;

    const weights = entries.map((e: WeightEntry) => e.weight);
    const current = weights[weights.length - 1];

    // Week ago
    const weekAgoDate = new Date();
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);
    const weekAgoStr = weekAgoDate.toISOString().split("T")[0];
    const weekAgoEntry = entries.findLast(
        (e: WeightEntry) => e.logged_at <= weekAgoStr
    );
    const weekChange = weekAgoEntry ? current - weekAgoEntry.weight : null;

    // Month ago
    const monthAgoDate = new Date();
    monthAgoDate.setDate(monthAgoDate.getDate() - 30);
    const monthAgoStr = monthAgoDate.toISOString().split("T")[0];
    const monthAgoEntry = entries.findLast(
        (e: WeightEntry) => e.logged_at <= monthAgoStr
    );
    const monthChange = monthAgoEntry ? current - monthAgoEntry.weight : null;

    return {
        current,
        weekChange,
        monthChange,
        lowest: Math.min(...weights),
        highest: Math.max(...weights),
        avgCaloriesOnGainDays: null, // will compute in correlation
        avgCaloriesOnLossDays: null,
    };
}

export interface WeightCalorieData {
    date: string;
    weight: number | null;
    calories: number | null;
}

export async function getWeightCalorieCorrelation(
    days: number = 30
): Promise<WeightCalorieData[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split("T")[0];

    // Fetch weight entries and food entries in parallel
    const [weightResult, foodResult] = await Promise.all([
        supabase
            .from("weight_entries")
            .select("weight, logged_at")
            .eq("user_id", user.id)
            .gte("logged_at", startStr)
            .order("logged_at", { ascending: true }),
        supabase
            .from("food_entries")
            .select("calories, logged_at")
            .eq("user_id", user.id)
            .gte("logged_at", startDate.toISOString())
            .order("logged_at", { ascending: true }),
    ]);

    // Build a map of date -> weight
    const weightMap = new Map<string, number>();
    for (const entry of weightResult.data || []) {
        weightMap.set(entry.logged_at, entry.weight);
    }

    // Build a map of date -> total calories
    const calorieMap = new Map<string, number>();
    for (const entry of foodResult.data || []) {
        const date = new Date(entry.logged_at).toISOString().split("T")[0];
        calorieMap.set(date, (calorieMap.get(date) || 0) + (entry.calories || 0));
    }

    // Merge into a single array with all dates
    const allDates = new Set([...Array.from(weightMap.keys()), ...Array.from(calorieMap.keys())]);
    const sorted = Array.from(allDates).sort();

    return sorted.map((date) => ({
        date,
        weight: weightMap.get(date) ?? null,
        calories: calorieMap.get(date) ?? null,
    }));
}

// ──────────────────────────────────────────────
// TDEE Calculator
// ──────────────────────────────────────────────

export interface TDEEResult {
    tdee: number;
    avgCalories: number;
    weightTrendPerWeek: number;
    dataPoints: number;
    completeness: number;
    confidence: "low" | "medium" | "high";
    rmse: number;
    targetCalories: number | null;
    goalDirection: "lose" | "gain" | "maintain" | null;
    currentWeight: number;
}

export interface TDEEProgress {
    weightDays: number;
    calorieDays: number;
    bothDays: number;
    requiredDays: number;
}

export type TDEEResponse =
    | { status: "ready"; data: TDEEResult }
    | { status: "insufficient"; progress: TDEEProgress };

const ANALYSIS_WINDOW = 28;
const MIN_ENTRIES = 14;
const MIN_COMPLETENESS = 0.7; // 70%
const MIN_CALORIE_DAY = 800; // cal threshold for "valid" logging day
const DECAY_PER_DAY = 0.9; // half-life ≈ 6.6 days
const CAL_PER_KG = 7700;
const EMA_ALPHA = 2 / (7 + 1); // 7-day EMA → α = 0.25

function applyEMA(values: { day: number; weight: number }[]): { day: number; weight: number }[] {
    if (values.length === 0) return [];
    const result: { day: number; weight: number }[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
        const gap = values[i].day - values[i - 1].day;
        const adjustedAlpha = 1 - Math.pow(1 - EMA_ALPHA, gap);
        result.push({
            day: values[i].day,
            weight: adjustedAlpha * values[i].weight + (1 - adjustedAlpha) * result[i - 1].weight,
        });
    }
    return result;
}

function weightedLinearRegression(
    points: { day: number; weight: number }[],
    todayDay: number
): { slope: number; intercept: number; rmse: number } {
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (const p of points) {
        const daysAgo = todayDay - p.day;
        const w = Math.pow(DECAY_PER_DAY, daysAgo);
        sumW += w;
        sumWX += w * p.day;
        sumWY += w * p.weight;
        sumWXX += w * p.day * p.day;
        sumWXY += w * p.day * p.weight;
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumWY / sumW, rmse: 0 };

    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
    const intercept = (sumWY - slope * sumWX) / sumW;

    // RMSE (weighted)
    let sumResidualSq = 0;
    for (const p of points) {
        const daysAgo = todayDay - p.day;
        const w = Math.pow(DECAY_PER_DAY, daysAgo);
        const predicted = intercept + slope * p.day;
        sumResidualSq += w * (p.weight - predicted) ** 2;
    }
    const rmse = Math.sqrt(sumResidualSq / sumW);

    return { slope, intercept, rmse };
}

function computeConfidence(
    dataPoints: number,
    completeness: number,
    rmse: number
): "low" | "medium" | "high" {
    const dataLevel = dataPoints >= 25 ? "high" : dataPoints >= 18 ? "medium" : "low";
    const compLevel = completeness >= 0.9 ? "high" : completeness >= 0.8 ? "medium" : "low";
    const rmseLevel = rmse <= 0.25 ? "high" : rmse <= 0.4 ? "medium" : "low";

    const levels = { high: 3, medium: 2, low: 1 };
    const min = Math.min(levels[dataLevel], levels[compLevel], levels[rmseLevel]);
    return min === 3 ? "high" : min === 2 ? "medium" : "low";
}

export async function calculateTDEE(): Promise<TDEEResponse> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { status: "insufficient", progress: { weightDays: 0, calorieDays: 0, bothDays: 0, requiredDays: MIN_ENTRIES } };

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - ANALYSIS_WINDOW);
    const startStr = startDate.toISOString().split("T")[0];

    // Fetch data in parallel
    const [weightResult, foodResult, profileResult] = await Promise.all([
        supabase
            .from("weight_entries")
            .select("weight, logged_at")
            .eq("user_id", user.id)
            .gte("logged_at", startStr)
            .order("logged_at", { ascending: true }),
        supabase
            .from("food_entries")
            .select("calories, logged_at")
            .eq("user_id", user.id)
            .gte("logged_at", startDate.toISOString())
            .order("logged_at", { ascending: true }),
        supabase
            .from("profiles")
            .select("goal_weight")
            .eq("id", user.id)
            .single(),
    ]);

    // Build date → weight map
    const weightMap = new Map<string, number>();
    for (const e of weightResult.data || []) {
        weightMap.set(e.logged_at, e.weight);
    }

    // Build date → total calories map (only valid days ≥ 800 cal)
    const rawCalorieMap = new Map<string, number>();
    for (const e of foodResult.data || []) {
        const d = new Date(e.logged_at).toISOString().split("T")[0];
        rawCalorieMap.set(d, (rawCalorieMap.get(d) || 0) + (e.calories || 0));
    }
    const calorieMap = new Map<string, number>();
    for (const [d, cal] of Array.from(rawCalorieMap.entries())) {
        if (cal >= MIN_CALORIE_DAY) calorieMap.set(d, cal);
    }

    // Count quality metrics
    const weightDays = weightMap.size;
    const calorieDays = calorieMap.size;

    // Count days with BOTH
    let bothDays = 0;
    for (const d of Array.from(weightMap.keys())) {
        if (calorieMap.has(d)) bothDays++;
    }
    const completeness = bothDays / ANALYSIS_WINDOW;

    // Quality gates
    if (weightDays < MIN_ENTRIES || calorieDays < MIN_ENTRIES || completeness < MIN_COMPLETENESS) {
        return {
            status: "insufficient",
            progress: { weightDays, calorieDays, bothDays, requiredDays: MIN_ENTRIES },
        };
    }

    // Build weight time series (day index from start)
    const dayZero = startDate.getTime();
    const msPerDay = 86400000;
    const weightPoints: { day: number; weight: number }[] = [];
    for (const [dateStr, w] of Array.from(weightMap.entries())) {
        const day = Math.round((new Date(dateStr + "T00:00:00").getTime() - dayZero) / msPerDay);
        weightPoints.push({ day, weight: w });
    }
    weightPoints.sort((a, b) => a.day - b.day);

    // Apply 7-day EMA smoothing
    const smoothed = applyEMA(weightPoints);

    // Today's day index
    const todayDay = Math.round((endDate.getTime() - dayZero) / msPerDay);

    // Exponentially weighted linear regression
    const { slope, rmse } = weightedLinearRegression(smoothed, todayDay);

    // Average daily calories (only valid days)
    let totalCal = 0;
    for (const cal of Array.from(calorieMap.values())) totalCal += cal;
    const avgCalories = Math.round(totalCal / calorieDays);

    // TDEE computation
    const weightTrendPerDay = slope; // kg/day
    const weightTrendPerWeek = weightTrendPerDay * 7;
    const dailyEnergyDelta = weightTrendPerDay * CAL_PER_KG;
    let tdee = Math.round(avgCalories - dailyEnergyDelta);

    // Current weight (most recent entry)
    const currentWeight = weightPoints[weightPoints.length - 1].weight;

    // Two-layer clamping
    const dynamicLow = Math.round(20 * currentWeight);
    const dynamicHigh = Math.round(45 * currentWeight);
    tdee = Math.max(dynamicLow, Math.min(dynamicHigh, tdee));
    tdee = Math.max(1200, Math.min(5000, tdee));

    // Confidence
    const confidence = computeConfidence(bothDays, completeness, rmse);

    // Goal-based recommendations
    const goalWeight = profileResult.data?.goal_weight as number | null;
    let goalDirection: "lose" | "gain" | "maintain" | null = null;
    let targetCalories: number | null = null;

    if (goalWeight !== null && goalWeight !== undefined) {
        const diff = currentWeight - goalWeight;
        if (diff > 1) {
            goalDirection = "lose";
            targetCalories = Math.max(1200, tdee - 550); // 0.5 kg/week loss
        } else if (diff < -1) {
            goalDirection = "gain";
            targetCalories = Math.min(5000, tdee + 275); // 0.25 kg/week gain
        } else {
            goalDirection = "maintain";
            targetCalories = tdee;
        }
    }

    return {
        status: "ready",
        data: {
            tdee,
            avgCalories,
            weightTrendPerWeek: Math.round(weightTrendPerWeek * 100) / 100,
            dataPoints: bothDays,
            completeness: Math.round(completeness * 100) / 100,
            confidence,
            rmse: Math.round(rmse * 1000) / 1000,
            targetCalories,
            goalDirection,
            currentWeight,
        },
    };
}
