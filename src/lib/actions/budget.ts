"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BudgetGoal, ExpenseEntry } from "@/types/database";

export async function getBudgetGoals(): Promise<BudgetGoal[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from("budget_goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    return (data as BudgetGoal[]) || [];
}

export async function setBudgetGoal(formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const period = formData.get("period") as string;
    const amountRaw = formData.get("amount") as string;
    const category = (formData.get("category") as string) || null;

    // Empty amount means remove this budget goal
    if (!amountRaw || amountRaw.trim() === "") {
        const query = supabase.from("budget_goals").delete().eq("user_id", user.id);
        if (category) {
            await query.eq("category", category);
        } else {
            await query.is("category", null);
        }
        revalidatePath("/budget");
        return { success: true };
    }

    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) return { error: "Invalid amount" };

    // Upsert by (user_id, category) — category can be null (overall)
    // Supabase upsert with onConflict requires the unique constraint
    const { error } = await supabase.from("budget_goals").upsert(
        {
            user_id: user.id,
            period,
            amount,
            category,
        },
        { onConflict: "user_id,category", ignoreDuplicates: false }
    );

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

    const { data: expenseEntries } = await supabase
        .from("expense_entries")
        .select("amount, category")
        .eq("user_id", user.id)
        .gte("expense_date", startDate.slice(0, 10))
        .lte("expense_date", endDate.slice(0, 10));

    const entries = expenseEntries || [];
    const totalSpend = entries.reduce((sum, e) => sum + (e.amount || 0), 0);

    const byCategory: Record<string, { count: number; total: number }> = {};
    for (const entry of entries) {
        const cat = entry.category || "other";
        if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
        byCategory[cat].count += 1;
        byCategory[cat].total += entry.amount || 0;
    }

    return {
        totalSpend,
        byCategory,
        grocerySpend: byCategory["groceries"]?.total || 0,
    };
}

export async function addExpenseEntry(formData: FormData): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const amount = parseFloat(formData.get("amount") as string);
    if (isNaN(amount) || amount <= 0) return { error: "Invalid amount" };

    const merchant_name = (formData.get("merchant_name") as string) || null;
    const category = (formData.get("category") as string) || null;
    const expense_date = (formData.get("expense_date") as string) || new Date().toISOString().slice(0, 10);
    const description = (formData.get("description") as string) || null;

    const { error } = await supabase.from("expense_entries").insert({
        user_id: user.id,
        amount,
        merchant_name,
        category,
        expense_date,
        description,
        source: "manual",
    });

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return {};
}

export async function updateExpenseEntry(
    id: string,
    updates: { amount?: number; category?: string | null; merchant_name?: string | null; description?: string | null }
): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("expense_entries")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return {};
}

export async function deleteExpenseEntry(id: string): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("expense_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return {};
}

export async function getExpenseEntries(startDate: string, endDate: string): Promise<ExpenseEntry[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from("expense_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("expense_date", startDate.slice(0, 10))
        .lte("expense_date", endDate.slice(0, 10))
        .order("expense_date", { ascending: false });

    return (data as ExpenseEntry[]) || [];
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
