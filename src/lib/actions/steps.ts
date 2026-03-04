"use server";

import { createClient } from "@/lib/supabase/server";
import type { StepEntry } from "@/types/database";
import { getToday } from "@/lib/timezone";

export async function getTodaySteps(date?: string): Promise<StepEntry | null> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const targetDate = date || getToday();

    const { data, error } = await supabase
        .from("step_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("logged_at", targetDate)
        .single();

    if (error) {
        if (error.code !== "PGRST116") { // Ignore record not found
            console.error("Error fetching today steps:", error);
        }
        return null;
    }

    return (data as StepEntry) || null;
}
