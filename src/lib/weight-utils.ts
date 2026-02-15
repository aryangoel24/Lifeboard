import type { WeightEntry } from "@/types/database";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface WeightStats {
    current: number | null;
    weekChange: number | null;
    monthChange: number | null;
    lowest: number | null;
    highest: number | null;
    avgCaloriesOnGainDays: number | null;
    avgCaloriesOnLossDays: number | null;
}

export interface WeightCalorieData {
    date: string;
    weight: number | null;
    calories: number | null;
}

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

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const ANALYSIS_WINDOW = 28;
const MIN_ENTRIES = 14;
const MIN_COMPLETENESS = 0.7;
const MIN_CALORIE_DAY = 800;
const DECAY_PER_DAY = 0.9;
const CAL_PER_KG = 7700;
const EMA_ALPHA = 2 / (7 + 1); // 7-day EMA → α = 0.25

// ──────────────────────────────────────────────
// Pure computation functions
// ──────────────────────────────────────────────

export function computeWeightStats(entries: WeightEntry[]): WeightStats {
    const empty: WeightStats = {
        current: null,
        weekChange: null,
        monthChange: null,
        lowest: null,
        highest: null,
        avgCaloriesOnGainDays: null,
        avgCaloriesOnLossDays: null,
    };

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
        avgCaloriesOnGainDays: null,
        avgCaloriesOnLossDays: null,
    };
}

export function computeWeightCalorieCorrelation(
    weightData: { weight: number; logged_at: string }[],
    foodData: { calories: number; logged_at: string }[],
    days: number = 30
): WeightCalorieData[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const weightMap = new Map<string, number>();
    for (const entry of weightData) {
        if (entry.logged_at >= cutoffStr) {
            weightMap.set(entry.logged_at, entry.weight);
        }
    }

    const calorieMap = new Map<string, number>();
    for (const entry of foodData) {
        const date = new Date(entry.logged_at).toISOString().split("T")[0];
        if (date >= cutoffStr) {
            calorieMap.set(date, (calorieMap.get(date) || 0) + (entry.calories || 0));
        }
    }

    const allDates = new Set([...Array.from(weightMap.keys()), ...Array.from(calorieMap.keys())]);
    const sorted = Array.from(allDates).sort();

    return sorted.map((date) => ({
        date,
        weight: weightMap.get(date) ?? null,
        calories: calorieMap.get(date) ?? null,
    }));
}

// ──────────────────────────────────────────────
// TDEE internals
// ──────────────────────────────────────────────

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

export function computeTDEE(
    weightData: { weight: number; logged_at: string }[],
    foodData: { calories: number; logged_at: string }[],
    goalWeight: number | null
): TDEEResponse {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - ANALYSIS_WINDOW);
    const startStr = startDate.toISOString().split("T")[0];

    const weightMap = new Map<string, number>();
    for (const e of weightData) {
        if (e.logged_at >= startStr) {
            weightMap.set(e.logged_at, e.weight);
        }
    }

    const rawCalorieMap = new Map<string, number>();
    for (const e of foodData) {
        const d = new Date(e.logged_at).toISOString().split("T")[0];
        if (d >= startStr) {
            rawCalorieMap.set(d, (rawCalorieMap.get(d) || 0) + (e.calories || 0));
        }
    }
    const calorieMap = new Map<string, number>();
    for (const [d, cal] of Array.from(rawCalorieMap.entries())) {
        if (cal >= MIN_CALORIE_DAY) calorieMap.set(d, cal);
    }

    const weightDays = weightMap.size;
    const calorieDays = calorieMap.size;

    let bothDays = 0;
    for (const d of Array.from(weightMap.keys())) {
        if (calorieMap.has(d)) bothDays++;
    }
    const completeness = bothDays / ANALYSIS_WINDOW;

    if (weightDays < MIN_ENTRIES || calorieDays < MIN_ENTRIES || completeness < MIN_COMPLETENESS) {
        return {
            status: "insufficient",
            progress: { weightDays, calorieDays, bothDays, requiredDays: MIN_ENTRIES },
        };
    }

    const dayZero = startDate.getTime();
    const msPerDay = 86400000;
    const weightPoints: { day: number; weight: number }[] = [];
    for (const [dateStr, w] of Array.from(weightMap.entries())) {
        const day = Math.round((new Date(dateStr + "T00:00:00").getTime() - dayZero) / msPerDay);
        weightPoints.push({ day, weight: w });
    }
    weightPoints.sort((a, b) => a.day - b.day);

    const smoothed = applyEMA(weightPoints);
    const todayDay = Math.round((endDate.getTime() - dayZero) / msPerDay);
    const { slope, rmse } = weightedLinearRegression(smoothed, todayDay);

    let totalCal = 0;
    for (const cal of Array.from(calorieMap.values())) totalCal += cal;
    const avgCalories = Math.round(totalCal / calorieDays);

    const weightTrendPerDay = slope;
    const weightTrendPerWeek = weightTrendPerDay * 7;
    const dailyEnergyDelta = weightTrendPerDay * CAL_PER_KG;
    let tdee = Math.round(avgCalories - dailyEnergyDelta);

    const currentWeight = weightPoints[weightPoints.length - 1].weight;

    const dynamicLow = Math.round(20 * currentWeight);
    const dynamicHigh = Math.round(45 * currentWeight);
    tdee = Math.max(dynamicLow, Math.min(dynamicHigh, tdee));
    tdee = Math.max(1200, Math.min(5000, tdee));

    const confidence = computeConfidence(bothDays, completeness, rmse);

    let goalDirection: "lose" | "gain" | "maintain" | null = null;
    let targetCalories: number | null = null;

    if (goalWeight !== null && goalWeight !== undefined) {
        const diff = currentWeight - goalWeight;
        if (diff > 1) {
            goalDirection = "lose";
            targetCalories = Math.max(1200, tdee - 550);
        } else if (diff < -1) {
            goalDirection = "gain";
            targetCalories = Math.min(5000, tdee + 275);
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
