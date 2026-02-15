"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BudgetGoal } from "@/types/database";

export async function getBudgetGoal(): Promise<BudgetGoal | null> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data } = await supabase
        .from("budget_goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    return data as BudgetGoal | null;
}

export async function setBudgetGoal(formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const period = formData.get("period") as string;
    const amount = parseFloat(formData.get("amount") as string);

    if (!amount || amount <= 0) return { error: "Invalid amount" };

    // Delete existing goals and create new one
    await supabase.from("budget_goals").delete().eq("user_id", user.id);

    const { error } = await supabase.from("budget_goals").insert({
        user_id: user.id,
        period,
        amount,
    });

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return { success: true };
}

export async function getBudgetSummary(startDate: string, endDate: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: entries } = await supabase
        .from("food_entries")
        .select("cost, meal_source, calories, protein")
        .eq("user_id", user.id)
        .gte("logged_at", startDate)
        .lte("logged_at", endDate)
        .not("cost", "is", null);

    if (!entries || entries.length === 0) {
        return {
            totalSpend: 0,
            mealCount: 0,
            avgCostPerMeal: 0,
            costPerProtein: 0,
            bySource: {} as Record<string, { count: number; total: number }>,
        };
    }

    const totalSpend = entries.reduce((sum, e) => sum + (e.cost || 0), 0);
    const totalProtein = entries.reduce((sum, e) => sum + (e.protein || 0), 0);

    const bySource: Record<string, { count: number; total: number }> = {};
    for (const entry of entries) {
        const source = entry.meal_source || "unspecified";
        if (!bySource[source]) bySource[source] = { count: 0, total: 0 };
        bySource[source].count += 1;
        bySource[source].total += entry.cost || 0;
    }

    return {
        totalSpend,
        mealCount: entries.length,
        avgCostPerMeal: entries.length > 0 ? totalSpend / entries.length : 0,
        costPerProtein: totalProtein > 0 ? totalSpend / totalProtein : 0,
        bySource,
    };
}

export async function getCookingStats(startDate: string, endDate: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: allEntries } = await supabase
        .from("food_entries")
        .select("meal_source, logged_at")
        .eq("user_id", user.id)
        .gte("logged_at", startDate)
        .lte("logged_at", endDate);

    if (!allEntries || allEntries.length === 0) {
        return { totalMeals: 0, homeCookedMeals: 0, percentage: 0 };
    }

    const homeCookedMeals = allEntries.filter(
        (e) => e.meal_source === "homemade"
    ).length;

    return {
        totalMeals: allEntries.length,
        homeCookedMeals,
        percentage: Math.round((homeCookedMeals / allEntries.length) * 100),
    };
}
