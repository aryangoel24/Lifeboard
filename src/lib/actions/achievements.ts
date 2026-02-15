"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserStreak, UserAchievement } from "@/types/database";

export async function getStreaks(): Promise<UserStreak[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from("user_streaks")
        .select("*")
        .eq("user_id", user.id);

    return (data as UserStreak[]) || [];
}

export async function getAchievements(): Promise<UserAchievement[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from("user_achievements")
        .select("*")
        .eq("user_id", user.id);

    return (data as UserAchievement[]) || [];
}

export async function updateStreaks() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const today = new Date().toISOString().split("T")[0];

    // Check if there are entries today
    const todayStart = new Date(today + "T00:00:00").toISOString();
    const todayEnd = new Date(today + "T23:59:59").toISOString();

    const { data: todayEntries } = await supabase
        .from("food_entries")
        .select("id, meal_source")
        .eq("user_id", user.id)
        .gte("logged_at", todayStart)
        .lte("logged_at", todayEnd);

    if (!todayEntries || todayEntries.length === 0) return;

    // Update logging streak
    await updateSingleStreak(supabase, user.id, "logging", today);

    // Update cooking streak (if any homemade meals today)
    const hasHomemade = todayEntries.some((e) => e.meal_source === "homemade");
    if (hasHomemade) {
        await updateSingleStreak(supabase, user.id, "cooking", today);
    }
}

async function updateSingleStreak(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    streakType: string,
    today: string
) {
    const { data: existing } = await supabase
        .from("user_streaks")
        .select("*")
        .eq("user_id", userId)
        .eq("streak_type", streakType)
        .single();

    if (existing) {
        const lastDate = existing.last_logged_date;
        const yesterday = new Date(new Date(today).getTime() - 86400000)
            .toISOString()
            .split("T")[0];

        let newCount = existing.current_count;
        if (lastDate === today) {
            // Already updated today
            return;
        } else if (lastDate === yesterday) {
            // Consecutive day
            newCount += 1;
        } else {
            // Streak broken, start fresh
            newCount = 1;
        }

        const longestCount = Math.max(existing.longest_count, newCount);

        await supabase
            .from("user_streaks")
            .update({
                current_count: newCount,
                longest_count: longestCount,
                last_logged_date: today,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
    } else {
        await supabase.from("user_streaks").insert({
            user_id: userId,
            streak_type: streakType,
            current_count: 1,
            longest_count: 1,
            last_logged_date: today,
        });
    }
}

export async function checkAndUnlockAchievements() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    // Get existing achievements, entry count, streaks, and recipe count in parallel
    const [{ data: existing }, { count: entryCount }, { data: streaks }, { count: recipeCount }] =
        await Promise.all([
            supabase
                .from("user_achievements")
                .select("achievement_key")
                .eq("user_id", user.id),
            supabase
                .from("food_entries")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id),
            supabase
                .from("user_streaks")
                .select("*")
                .eq("user_id", user.id),
            supabase
                .from("recipes")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id),
        ]);

    const unlockedKeys = new Set((existing || []).map((a) => a.achievement_key));
    const toInsert: { user_id: string; achievement_key: string }[] = [];

    // Check entry count achievements
    const entryMilestones = [
        { count: 10, key: "entries_10" },
        { count: 50, key: "entries_50" },
        { count: 100, key: "entries_100" },
        { count: 500, key: "entries_500" },
    ];

    for (const milestone of entryMilestones) {
        if ((entryCount || 0) >= milestone.count && !unlockedKeys.has(milestone.key)) {
            toInsert.push({ user_id: user.id, achievement_key: milestone.key });
        }
    }

    // Check streak achievements
    const loggingStreak = (streaks || []).find((s) => s.streak_type === "logging");
    const cookingStreak = (streaks || []).find((s) => s.streak_type === "cooking");

    if (loggingStreak) {
        if (loggingStreak.current_count >= 7 && !unlockedKeys.has("streak_7")) {
            toInsert.push({ user_id: user.id, achievement_key: "streak_7" });
        }
        if (loggingStreak.current_count >= 30 && !unlockedKeys.has("streak_30")) {
            toInsert.push({ user_id: user.id, achievement_key: "streak_30" });
        }
    }

    if (cookingStreak) {
        if (cookingStreak.current_count >= 3 && !unlockedKeys.has("cooking_streak_3")) {
            toInsert.push({ user_id: user.id, achievement_key: "cooking_streak_3" });
        }
        if (cookingStreak.current_count >= 7 && !unlockedKeys.has("cooking_streak_7")) {
            toInsert.push({ user_id: user.id, achievement_key: "cooking_streak_7" });
        }
    }

    // Check recipe count
    if ((recipeCount || 0) >= 5 && !unlockedKeys.has("recipes_5")) {
        toInsert.push({ user_id: user.id, achievement_key: "recipes_5" });
    }

    // Batch insert all new achievements at once
    if (toInsert.length > 0) {
        await supabase.from("user_achievements").insert(toInsert);
    }

    return toInsert.map((a) => a.achievement_key);
}

export async function getEntryStats() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { totalEntries: 0 };

    const { count } = await supabase
        .from("food_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

    return { totalEntries: count || 0 };
}
