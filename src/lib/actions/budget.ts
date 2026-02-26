"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BudgetGoal, ExpenseEntry } from "@/types/database";
import { suggestCategoryForMerchant } from "@/lib/receipt-utils";

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
        .eq("is_recurring", false)
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
    const is_recurring = formData.get("is_recurring") === "true";
    const recurring_day_raw = formData.get("recurring_day_of_month") as string;
    const recurring_day_of_month = is_recurring && recurring_day_raw ? parseInt(recurring_day_raw, 10) : null;

    if (is_recurring) {
        if (!recurring_day_of_month || recurring_day_of_month < 1 || recurring_day_of_month > 31) {
            return { error: "Invalid recurring day (must be 1–31)" };
        }

        // Insert the template entry
        const { data: template, error: templateError } = await supabase
            .from("expense_entries")
            .insert({
                user_id: user.id,
                amount,
                merchant_name,
                category,
                expense_date: new Date().toISOString().slice(0, 10),
                description,
                source: "manual",
                is_recurring: true,
                recurring_day_of_month,
            })
            .select("id")
            .single();

        if (templateError || !template) return { error: templateError?.message || "Failed to create recurring template" };

        // Spawn a concrete entry for the current month if the day has passed/is today
        const today = new Date();
        const todayDay = today.getDate();
        const year = today.getFullYear();
        const month = today.getMonth(); // 0-indexed

        // Cap day to last day of current month
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        const spawnDay = Math.min(recurring_day_of_month, lastDayOfMonth);

        if (spawnDay <= todayDay) {
            const spawnDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(spawnDay).padStart(2, "0")}`;
            await supabase.from("expense_entries").insert({
                user_id: user.id,
                amount,
                merchant_name,
                category,
                expense_date: spawnDate,
                description,
                source: "manual",
                is_recurring: false,
                recurring_parent_id: template.id,
            });
        }
    } else {
        const { error } = await supabase.from("expense_entries").insert({
            user_id: user.id,
            amount,
            merchant_name,
            category,
            expense_date,
            description,
            source: "manual",
            is_recurring: false,
        });

        if (error) return { error: error.message };
    }

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
        .eq("is_recurring", false)
        .gte("expense_date", startDate.slice(0, 10))
        .lte("expense_date", endDate.slice(0, 10))
        .order("expense_date", { ascending: false });

    return (data as ExpenseEntry[]) || [];
}

export async function getRecurringTemplates(): Promise<ExpenseEntry[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from("expense_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_recurring", true)
        .order("created_at", { ascending: true });

    return (data as ExpenseEntry[]) || [];
}

export async function deleteRecurringTemplate(id: string): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    // Only delete the template; spawned entries remain as history
    const { error } = await supabase
        .from("expense_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("is_recurring", true);

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return {};
}

export async function ensureRecurringExpensesSpawned(startDate: string, endDate: string): Promise<void> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const templates = await getRecurringTemplates();
    if (templates.length === 0) return;

    const today = new Date();
    const todayDay = today.getDate();

    // Parse startDate to get year/month for the target period
    const periodStart = new Date(startDate + "T00:00:00");
    const periodYear = periodStart.getFullYear();
    const periodMonth = periodStart.getMonth(); // 0-indexed

    for (const template of templates) {
        const day = template.recurring_day_of_month;
        if (!day) continue;

        // Cap day to last day of the period's month
        const lastDayOfPeriodMonth = new Date(periodYear, periodMonth + 1, 0).getDate();
        const spawnDay = Math.min(day, lastDayOfPeriodMonth);

        const spawnDate = `${periodYear}-${String(periodMonth + 1).padStart(2, "0")}-${String(spawnDay).padStart(2, "0")}`;

        // Only spawn if within the period range and day has passed/is today (for current month)
        if (spawnDate < startDate || spawnDate > endDate) continue;

        // For future months (offset > 0), always spawn; for current month, only if day <= today
        const isCurrentMonth =
            periodYear === today.getFullYear() && periodMonth === today.getMonth();
        if (isCurrentMonth && spawnDay > todayDay) continue;

        // Check if already spawned for this period
        const { data: existing } = await supabase
            .from("expense_entries")
            .select("id")
            .eq("user_id", user.id)
            .eq("recurring_parent_id", template.id)
            .gte("expense_date", startDate)
            .lte("expense_date", endDate)
            .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("expense_entries").insert({
            user_id: user.id,
            amount: template.amount,
            merchant_name: template.merchant_name,
            category: template.category,
            expense_date: spawnDate,
            description: template.description,
            source: "manual",
            is_recurring: false,
            recurring_parent_id: template.id,
        });
    }
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

export async function suggestExpenseCategory(merchantName: string): Promise<{ category: string | null }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { category: null };

    const category = await suggestCategoryForMerchant(merchantName);
    return { category };
}
