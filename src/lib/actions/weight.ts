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
    const weekAgoEntry = entries.find(
        (e: WeightEntry) => e.logged_at <= weekAgoStr
    );
    const weekChange = weekAgoEntry ? current - weekAgoEntry.weight : null;

    // Month ago
    const monthAgoDate = new Date();
    monthAgoDate.setDate(monthAgoDate.getDate() - 30);
    const monthAgoStr = monthAgoDate.toISOString().split("T")[0];
    const monthAgoEntry = entries.find(
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
