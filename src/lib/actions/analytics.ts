"use server";

import { createClient } from "@/lib/supabase/server";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

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

export async function getMacroTrends(days: number = 30): Promise<DailyMacroData[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const endDate = new Date();
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

export async function getWeeklySummary() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const endDate = new Date();
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
