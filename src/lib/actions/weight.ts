"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WeightEntry } from "@/types/database";
import { getToday, getNow } from "@/lib/timezone";
import type { WeightStats, WeightCalorieData, TDEEResponse } from "@/lib/weight-utils";

// Re-export types and pure functions for external consumers
export type { WeightStats, WeightCalorieData, TDEEResponse };
export type { TDEEResult, TDEEProgress } from "@/lib/weight-utils";

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

    const loggedAt = date || getToday();

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

    const startDate = getNow();
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

    const targetDate = date || getToday();

    const { data } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("logged_at", targetDate)
        .single();

    return (data as WeightEntry) || null;
}
