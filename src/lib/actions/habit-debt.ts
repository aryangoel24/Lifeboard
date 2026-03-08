"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  HabitDebt,
  HabitDebtMeta,
  HabitType,
  CustomHabit,
  HabitEntry,
} from "@/types/database";
import {
  FLAT_PENALTY_CENTS,
  getMondayOfWeek,
  isHabitCompletedForDate,
  isHabitScheduledForDate,
  addDays,
} from "@/lib/habit-debt-utils";

export type DebtState = {
  debts: HabitDebt[];
  currentWeekTotalCents: number;
  totalDebtCents: number;
};

/**
 * Computes and updates debt state for all opted-in habits.
 * Called on dashboard page load. Idempotent — won't double-charge.
 * Also handles the weekly rollover on Mondays.
 */
export async function computeAndUpdateDebt(today: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const yesterday = addDays(today, -1);

  const [profileResult, customHabitsResult, debtRowsResult, metaResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("custom_habits")
        .select("*")
        .eq("user_id", user.id)
        .eq("archived", false),
      supabase.from("habit_debt").select("*").eq("user_id", user.id),
      supabase
        .from("habit_debt_meta")
        .select("*")
        .eq("user_id", user.id)
        .single(),
    ]);

  const profile = profileResult.data;
  if (!profile) return;

  const customHabits: CustomHabit[] = (customHabitsResult.data as CustomHabit[]) || [];
  const debtRows: HabitDebt[] = (debtRowsResult.data as HabitDebt[]) || [];
  const meta: HabitDebtMeta | null = metaResult.data as HabitDebtMeta | null;

  // Build list of opted-in habits
  type OptedInHabit = {
    habitType: HabitType;
    customHabitId: string | null;
    habit: CustomHabit | null;
  };

  const optedInHabits: OptedInHabit[] = [];
  if (profile.creatine_nr_enabled) {
    optedInHabits.push({ habitType: "creatine", customHabitId: null, habit: null });
  }
  if (profile.magnesium_nr_enabled) {
    optedInHabits.push({ habitType: "magnesium", customHabitId: null, habit: null });
  }
  if (profile.gym_nr_enabled) {
    optedInHabits.push({ habitType: "gym", customHabitId: null, habit: null });
  }
  for (const h of customHabits) {
    if (h.nr_enabled) {
      optedInHabits.push({ habitType: "custom", customHabitId: h.id, habit: h });
    }
  }

  if (optedInHabits.length === 0) return;

  // Ensure habit_debt_meta row exists (create if first time)
  await supabase
    .from("habit_debt_meta")
    .upsert(
      {
        user_id: user.id,
        recovery_mode_active: false,
        recovery_mode_start: null,
        recovery_mode_deadline: null,
        recovery_streak: 0,
        recovery_cooldown_until: null,
        total_debt_cents: 0,
        last_week_reset_date: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  // Upsert habit_debt rows for newly opted-in habits
  for (const opted of optedInHabits) {
    const existing = debtRows.find(
      (d) =>
        d.habit_type === opted.habitType &&
        (opted.customHabitId
          ? d.custom_habit_id === opted.customHabitId
          : d.custom_habit_id === null)
    );
    if (!existing) {
      const newRow = {
        user_id: user.id,
        habit_type: opted.habitType,
        custom_habit_id: opted.customHabitId,
        nr_opted_in_at: today,
        debt_count: 0,
        completions_pending: 0,
        scheduled_clean_streak: 0,
        consecutive_miss_days: 0,
        current_week_unpaid_cents: 0,
        debt_computed_through: today,
      };
      const { data: inserted } = await supabase
        .from("habit_debt")
        .insert(newRow)
        .select()
        .single();
      if (inserted) debtRows.push(inserted as HabitDebt);
    }
  }

  // Find the earliest debt_computed_through among opted-in habits
  const relevantDebts = debtRows.filter((d) =>
    optedInHabits.some(
      (o) =>
        o.habitType === d.habit_type &&
        (o.customHabitId
          ? d.custom_habit_id === o.customHabitId
          : d.custom_habit_id === null)
    )
  );

  if (relevantDebts.length === 0) return;

  const earliestThrough = relevantDebts.reduce((min, d) => {
    if (!d.debt_computed_through) return min;
    return d.debt_computed_through < min ? d.debt_computed_through : min;
  }, today);

  // Process missed days if there are uncomputed days
  if (earliestThrough < yesterday) {
    const fetchFrom = addDays(earliestThrough, 1);

    const [builtinEntriesResult, customEntriesResult] = await Promise.all([
      supabase
        .from("habit_entries")
        .select("*")
        .eq("user_id", user.id)
        .is("custom_habit_id", null)
        .gte("logged_at", fetchFrom)
        .lte("logged_at", yesterday),
      supabase
        .from("habit_entries")
        .select("*")
        .eq("user_id", user.id)
        .not("custom_habit_id", "is", null)
        .gte("logged_at", fetchFrom)
        .lte("logged_at", yesterday),
    ]);

    const builtinEntries: HabitEntry[] = (builtinEntriesResult.data as HabitEntry[]) || [];
    const customEntries: HabitEntry[] = (customEntriesResult.data as HabitEntry[]) || [];

    // Track in-memory state for each debt row
    const debtState = new Map<string, HabitDebt>(
      relevantDebts.map((d) => [d.id, { ...d }])
    );

    const newPenaltyEvents: Array<{
      user_id: string;
      habit_type: HabitType;
      custom_habit_id: string | null;
      event_date: string;
      cents: number;
      reason: string;
    }> = [];

    let currentDate = addDays(earliestThrough, 1);
    while (currentDate <= yesterday) {
      for (const debt of Array.from(debtState.values())) {
        const opted = optedInHabits.find(
          (o) =>
            o.habitType === debt.habit_type &&
            (o.customHabitId
              ? debt.custom_habit_id === o.customHabitId
              : debt.custom_habit_id === null)
        );
        if (!opted) continue;

        // Skip if already computed through this date
        if (debt.debt_computed_through && debt.debt_computed_through >= currentDate) continue;

        // Check scheduling
        let scheduled = false;
        if (opted.habitType !== "custom") {
          scheduled = true;
        } else if (opted.habit) {
          scheduled = isHabitScheduledForDate(opted.habit, currentDate);
        }

        if (!scheduled) {
          debt.debt_computed_through = currentDate;
          continue;
        }

        // Check if completed
        const completed = isHabitCompletedForDate(
          opted.habitType,
          opted.customHabitId,
          builtinEntries,
          customEntries,
          opted.habit,
          profile.creatine_goal ?? 2,
          currentDate
        );

        if (completed) {
          debt.scheduled_clean_streak++;
        } else {
          debt.debt_count++;
          debt.consecutive_miss_days++;
          debt.scheduled_clean_streak = 0;
          debt.current_week_unpaid_cents += FLAT_PENALTY_CENTS;

          newPenaltyEvents.push({
            user_id: user.id,
            habit_type: debt.habit_type,
            custom_habit_id: debt.custom_habit_id,
            event_date: currentDate,
            cents: FLAT_PENALTY_CENTS,
            reason: "miss",
          });
        }

        debt.debt_computed_through = currentDate;
      }

      currentDate = addDays(currentDate, 1);
    }

    // Batch insert penalty events
    if (newPenaltyEvents.length > 0) {
      await supabase.from("penalty_events").insert(newPenaltyEvents);
    }

    // Update all debt rows in parallel
    await Promise.all(
      Array.from(debtState.values()).map((debt) =>
        supabase
          .from("habit_debt")
          .update({
            debt_count: debt.debt_count,
            scheduled_clean_streak: debt.scheduled_clean_streak,
            consecutive_miss_days: debt.consecutive_miss_days,
            current_week_unpaid_cents: debt.current_week_unpaid_cents,
            debt_computed_through: debt.debt_computed_through,
            updated_at: new Date().toISOString(),
          })
          .eq("id", debt.id)
      )
    );
  }

  // Weekly reset — roll current week debt into total_debt_cents every Monday
  const thisMonday = getMondayOfWeek(today);
  if (!meta?.last_week_reset_date || meta.last_week_reset_date < thisMonday) {
    // Fetch fresh per-habit values (reflects any updates done above)
    const { data: freshDebts } = await supabase
      .from("habit_debt")
      .select("current_week_unpaid_cents")
      .eq("user_id", user.id);

    const rollover = (freshDebts || []).reduce(
      (sum: number, d: { current_week_unpaid_cents: number }) =>
        sum + (d.current_week_unpaid_cents || 0),
      0
    );

    // Atomically update meta — .or() guard prevents double-rollover on concurrent loads
    await supabase
      .from("habit_debt_meta")
      .update({
        total_debt_cents: (meta?.total_debt_cents ?? 0) + rollover,
        last_week_reset_date: thisMonday,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .or(`last_week_reset_date.is.null,last_week_reset_date.lt.${thisMonday}`);

    // Zero out per-habit current week values
    await supabase
      .from("habit_debt")
      .update({
        current_week_unpaid_cents: 0,
        debt_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }
}

/**
 * Returns current debt state for display.
 */
export async function getDebtState(): Promise<DebtState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { debts: [], currentWeekTotalCents: 0, totalDebtCents: 0 };
  }

  const [debtsResult, metaResult] = await Promise.all([
    supabase.from("habit_debt").select("*").eq("user_id", user.id),
    supabase.from("habit_debt_meta").select("*").eq("user_id", user.id).single(),
  ]);

  const debts = (debtsResult.data as HabitDebt[]) || [];
  const meta = metaResult.data as HabitDebtMeta | null;

  const currentWeekTotalCents = debts.reduce(
    (sum, d) => sum + (d.current_week_unpaid_cents || 0),
    0
  );
  const totalDebtCents = meta?.total_debt_cents ?? 0;

  return { debts, currentWeekTotalCents, totalDebtCents };
}

/**
 * Marks all total debt as paid (resets to $0).
 */
export async function payOffTotalDebt(): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("habit_debt_meta")
    .update({ total_debt_cents: 0, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Updates NR settings for a built-in habit.
 */
export async function updateBuiltinHabitNRSettings(
  habitType: "creatine" | "magnesium" | "gym",
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase
    .from("profiles")
    .update({
      [`${habitType}_nr_enabled`]: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  if (enabled) {
    await supabase.from("habit_debt").upsert(
      {
        user_id: user.id,
        habit_type: habitType,
        custom_habit_id: null,
        nr_opted_in_at: today,
        debt_count: 0,
        completions_pending: 0,
        scheduled_clean_streak: 0,
        consecutive_miss_days: 0,
        current_week_unpaid_cents: 0,
        debt_computed_through: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,habit_type" }
    );
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Updates NR settings for a custom habit.
 */
export async function updateCustomHabitNRSettings(
  habitId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  const { data: habit } = await supabase
    .from("custom_habits")
    .select("id")
    .eq("id", habitId)
    .eq("user_id", user.id)
    .single();

  if (!habit) return { error: "Habit not found" };

  const { error } = await supabase
    .from("custom_habits")
    .update({
      nr_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", habitId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (enabled) {
    await supabase.from("habit_debt").upsert(
      {
        user_id: user.id,
        habit_type: "custom",
        custom_habit_id: habitId,
        nr_opted_in_at: today,
        debt_count: 0,
        completions_pending: 0,
        scheduled_clean_streak: 0,
        consecutive_miss_days: 0,
        current_week_unpaid_cents: 0,
        debt_computed_through: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,custom_habit_id" }
    );
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return {};
}
