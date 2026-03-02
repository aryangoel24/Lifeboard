"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  HabitDebt,
  HabitDebtMeta,
  HabitType,
  PenaltyMonth,
  CustomHabit,
  HabitEntry,
} from "@/types/database";
import {
  getPenaltyTierCents,
  getForgivenessCents,
  getHabitFrequencyWeight,
  applyGlobalDailyCap,
  computeRecoveryCompliance,
  isHabitCompletedForDate,
  isHabitScheduledForDate,
  addDays,
  getMonthStart,
  isSameMonth,
  type CapCandidate,
} from "@/lib/habit-debt-utils";

export type DebtState = {
  debts: HabitDebt[];
  meta: HabitDebtMeta | null;
  unsettledMonths: PenaltyMonth[];
  liveMonthChargedCents: number;
  liveMonthForgivenCents: number;
};

/**
 * Computes and updates debt state for all opted-in habits.
 * Called on dashboard page load. Idempotent — won't double-charge.
 */
export async function computeAndUpdateDebt(today: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const yesterday = addDays(today, -1);

  // Fetch all needed data in parallel
  const [
    profileResult,
    customHabitsResult,
    debtRowsResult,
    metaResult,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("custom_habits").select("*").eq("user_id", user.id).eq("archived", false),
    supabase.from("habit_debt").select("*").eq("user_id", user.id),
    supabase.from("habit_debt_meta").select("*").eq("user_id", user.id).single(),
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
    isHard: boolean;
    habit: CustomHabit | null;
  };

  const optedInHabits: OptedInHabit[] = [];
  if (profile.creatine_nr_enabled) {
    optedInHabits.push({ habitType: "creatine", customHabitId: null, isHard: profile.creatine_nr_is_hard, habit: null });
  }
  if (profile.magnesium_nr_enabled) {
    optedInHabits.push({ habitType: "magnesium", customHabitId: null, isHard: profile.magnesium_nr_is_hard, habit: null });
  }
  if (profile.gym_nr_enabled) {
    optedInHabits.push({ habitType: "gym", customHabitId: null, isHard: profile.gym_nr_is_hard, habit: null });
  }
  for (const h of customHabits) {
    if (h.nr_enabled) {
      optedInHabits.push({ habitType: "custom", customHabitId: h.id, isHard: h.nr_is_hard, habit: h });
    }
  }

  if (optedInHabits.length === 0) return;

  // Upsert habit_debt rows for newly opted-in habits
  for (const opted of optedInHabits) {
    const existing = debtRows.find(
      (d) =>
        d.habit_type === opted.habitType &&
        (opted.customHabitId ? d.custom_habit_id === opted.customHabitId : d.custom_habit_id === null)
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
        lifetime_unpaid_cents: 0,
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

  // Find the earliest debt_computed_through
  const relevantDebts = debtRows.filter((d) =>
    optedInHabits.some(
      (o) =>
        o.habitType === d.habit_type &&
        (o.customHabitId ? d.custom_habit_id === o.customHabitId : d.custom_habit_id === null)
    )
  );

  if (relevantDebts.length === 0) return;

  const earliestThrough = relevantDebts.reduce((min, d) => {
    if (!d.debt_computed_through) return min;
    return d.debt_computed_through < min ? d.debt_computed_through : min;
  }, today);

  // If already computed through yesterday, nothing to do
  if (earliestThrough >= yesterday) return;

  // Fetch habit entries for the backfill range
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

  // Collect all penalty events to batch insert
  const newPenaltyEvents: Array<{
    user_id: string;
    habit_type: HabitType;
    custom_habit_id: string | null;
    event_date: string;
    cents: number;
    reason: string;
  }> = [];

  // Track month boundaries crossed
  const monthsToUpsert = new Set<string>();

  // Process day by day from earliest through yesterday
  let currentDate = addDays(earliestThrough, 1);
  while (currentDate <= yesterday) {
    const candidates: CapCandidate[] = [];
    const dayMissedDebts: string[] = []; // debt IDs that missed today

    for (const debt of Array.from(debtState.values())) {
      const opted = optedInHabits.find(
        (o) =>
          o.habitType === debt.habit_type &&
          (o.customHabitId
            ? debt.custom_habit_id === o.customHabitId
            : debt.custom_habit_id === null)
      );
      if (!opted) continue;

      // Only process if this debt hasn't been computed through this date
      if (debt.debt_computed_through && debt.debt_computed_through >= currentDate) continue;

      // Check scheduling
      let scheduled = false;
      if (opted.habitType !== "custom") {
        scheduled = true;
      } else if (opted.habit) {
        scheduled = isHabitScheduledForDate(opted.habit, currentDate);
      }

      if (!scheduled) {
        // Update debt_computed_through even for unscheduled days
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
        if (debt.scheduled_clean_streak >= 7) {
          debt.consecutive_miss_days = 0;
        }
      } else {
        debt.debt_count++;
        debt.consecutive_miss_days++;
        debt.scheduled_clean_streak = 0;
        dayMissedDebts.push(debt.id);

        const tierCents = getPenaltyTierCents(debt.consecutive_miss_days);
        const weight = getHabitFrequencyWeight(opted.habit);
        candidates.push({
          habitType: debt.habit_type,
          customHabitId: debt.custom_habit_id,
          consecutiveMissDays: debt.consecutive_miss_days,
          frequencyWeight: weight,
          cents: tierCents,
        });
      }

      debt.debt_computed_through = currentDate;
    }

    // Apply global cap for this day
    if (candidates.length > 0) {
      const { charged, skipped } = applyGlobalDailyCap(candidates);

      // Recovery mode: if active, paused charges become 'recovery_paused' events
      const isRecoveryActive =
        meta?.recovery_mode_active &&
        meta.recovery_mode_deadline &&
        meta.recovery_mode_deadline >= currentDate;

      for (const c of charged) {
        const debt = Array.from(debtState.values()).find(
          (d) =>
            d.habit_type === c.habitType &&
            (c.customHabitId
              ? d.custom_habit_id === c.customHabitId
              : d.custom_habit_id === null)
        );
        if (!debt) continue;

        if (isRecoveryActive) {
          newPenaltyEvents.push({
            user_id: user.id,
            habit_type: c.habitType,
            custom_habit_id: c.customHabitId,
            event_date: currentDate,
            cents: c.cents,
            reason: "recovery_paused",
          });
          // Don't charge lifetime_unpaid_cents during recovery
        } else {
          newPenaltyEvents.push({
            user_id: user.id,
            habit_type: c.habitType,
            custom_habit_id: c.customHabitId,
            event_date: currentDate,
            cents: c.cents,
            reason: "miss",
          });
          debt.lifetime_unpaid_cents += c.cents;
        }
      }

      for (const c of skipped) {
        newPenaltyEvents.push({
          user_id: user.id,
          habit_type: c.habitType,
          custom_habit_id: c.customHabitId,
          event_date: currentDate,
          cents: c.cents,
          reason: "cap_skipped",
        });
      }
    }

    // Track month boundaries
    const nextDate = addDays(currentDate, 1);
    if (!isSameMonth(currentDate, nextDate) && nextDate <= yesterday) {
      monthsToUpsert.add(getMonthStart(nextDate));
    }

    currentDate = nextDate;
  }

  // Check recovery mode expiry
  if (meta?.recovery_mode_active) {
    if (
      meta.recovery_mode_deadline &&
      meta.recovery_mode_deadline < today
    ) {
      // Forced exit: past deadline
      await supabase
        .from("habit_debt_meta")
        .update({
          recovery_mode_active: false,
          recovery_mode_start: null,
          recovery_mode_deadline: null,
          recovery_streak: 0,
          recovery_cooldown_until: addDays(today, 3),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    } else {
      // Check compliance
      const optedForCompliance = optedInHabits.map((o) => ({
        habitType: o.habitType,
        customHabitId: o.customHabitId,
        isHard: o.isHard,
      }));
      const compliance = computeRecoveryCompliance(
        builtinEntries,
        customEntries,
        customHabits,
        optedForCompliance,
        profile.creatine_goal ?? 2,
        today,
        7
      );
      if (compliance < 0.7) {
        await supabase
          .from("habit_debt_meta")
          .update({
            recovery_mode_active: false,
            recovery_mode_start: null,
            recovery_mode_deadline: null,
            recovery_streak: 0,
            recovery_cooldown_until: addDays(today, 3),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
      }
    }
  }

  // Batch insert penalty events
  if (newPenaltyEvents.length > 0) {
    await supabase.from("penalty_events").insert(newPenaltyEvents);
  }

  // Upsert month summaries for completed months
  for (const monthStart of Array.from(monthsToUpsert)) {
    const monthEnd = addDays(getMonthStart(addDays(monthStart, 32)), -1);
    const { data: monthEvents } = await supabase
      .from("penalty_events")
      .select("cents")
      .eq("user_id", user.id)
      .eq("reason", "miss")
      .gte("event_date", monthStart)
      .lte("event_date", monthEnd);

    const totalCents = (monthEvents || []).reduce((sum, e) => sum + (e.cents || 0), 0);
    await supabase.from("penalty_months").upsert(
      {
        user_id: user.id,
        month: monthStart,
        total_cents: totalCents,
      },
      { onConflict: "user_id,month", ignoreDuplicates: false }
    );
  }

  // Update all debt rows in parallel
  await Promise.all(
    Array.from(debtState.values()).map((debt) =>
      supabase
        .from("habit_debt")
        .update({
          debt_count: debt.debt_count,
          completions_pending: debt.completions_pending,
          scheduled_clean_streak: debt.scheduled_clean_streak,
          consecutive_miss_days: debt.consecutive_miss_days,
          lifetime_unpaid_cents: debt.lifetime_unpaid_cents,
          debt_computed_through: debt.debt_computed_through,
          updated_at: new Date().toISOString(),
        })
        .eq("id", debt.id)
    )
  );
}

/**
 * Applies forgiveness when a habit is completed.
 * Called from logHabit / logCustomHabit after successful logging.
 */
export async function applyHabitCompletion(
  habitType: HabitType,
  customHabitId: string | null,
  isHard: boolean,
  today: string
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Fetch the debt row
  const query = supabase
    .from("habit_debt")
    .select("*")
    .eq("user_id", user.id)
    .eq("habit_type", habitType);

  const { data: debtRow } = customHabitId
    ? await query.eq("custom_habit_id", customHabitId).single()
    : await query.is("custom_habit_id", null).single();

  if (!debtRow) return; // NR not configured for this habit

  // Validate it's a scheduled day for custom habits
  if (habitType === "custom" && customHabitId) {
    const { data: habit } = await supabase
      .from("custom_habits")
      .select("*")
      .eq("id", customHabitId)
      .eq("user_id", user.id)
      .single();

    if (!habit) return;
    if (!(habit as CustomHabit).nr_enabled) return;

    const { isHabitScheduledForDate: checkScheduled } = await import("@/lib/habit-debt-utils");
    if (!checkScheduled(habit as CustomHabit, today)) return;
  }

  // Check daily forgiveness cap
  const maxForgivenessEvents = isHard ? 1 : 2;
  let forgivenessQuery = supabase
    .from("penalty_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("habit_type", habitType)
    .eq("event_date", today)
    .eq("reason", "forgiven");

  if (customHabitId) {
    forgivenessQuery = forgivenessQuery.eq("custom_habit_id", customHabitId) as typeof forgivenessQuery;
  } else {
    forgivenessQuery = forgivenessQuery.is("custom_habit_id", null) as typeof forgivenessQuery;
  }

  const { data: todayForgivenessData } = await forgivenessQuery;
  const forgivenessTodayCount = (todayForgivenessData?.length ?? 0);
  if (forgivenessTodayCount >= maxForgivenessEvents) return; // Already maxed

  const debt = debtRow as HabitDebt;
  const forgivenessCents = getForgivenessCents(isHard);

  // Update completions_pending and debt_count
  let newCompletionsPending = debt.completions_pending + 1;
  const completionsNeeded = isHard ? 1 : 2;
  let newDebtCount = debt.debt_count;

  if (newCompletionsPending >= completionsNeeded) {
    newDebtCount = Math.max(0, debt.debt_count - 1);
    newCompletionsPending = 0;
  }

  const newLifetimeUnpaid = Math.max(0, debt.lifetime_unpaid_cents - forgivenessCents);
  const newStreak = debt.scheduled_clean_streak + 1;
  const newConsecutiveMiss = newStreak >= 7 ? 0 : debt.consecutive_miss_days;

  await Promise.all([
    supabase
      .from("habit_debt")
      .update({
        debt_count: newDebtCount,
        completions_pending: newCompletionsPending,
        scheduled_clean_streak: newStreak,
        consecutive_miss_days: newConsecutiveMiss,
        lifetime_unpaid_cents: newLifetimeUnpaid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", debt.id),
    supabase.from("penalty_events").insert({
      user_id: user.id,
      habit_type: habitType,
      custom_habit_id: customHabitId,
      event_date: today,
      cents: -forgivenessCents,
      reason: "forgiven",
    }),
  ]);

  // Update recovery streak if in recovery mode
  const { data: meta } = await supabase
    .from("habit_debt_meta")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (meta?.recovery_mode_active) {
    await supabase
      .from("habit_debt_meta")
      .update({
        recovery_streak: (meta.recovery_streak || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }
}

/**
 * Returns current debt state including live month stats from penalty_events.
 */
export async function getDebtState(): Promise<DebtState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { debts: [], meta: null, unsettledMonths: [], liveMonthChargedCents: 0, liveMonthForgivenCents: 0 };
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().split("T")[0];

  const [debtsResult, metaResult, unsettledMonthsResult, liveEventsResult] =
    await Promise.all([
      supabase.from("habit_debt").select("*").eq("user_id", user.id),
      supabase.from("habit_debt_meta").select("*").eq("user_id", user.id).single(),
      supabase
        .from("penalty_months")
        .select("*")
        .eq("user_id", user.id)
        .is("settled_at", null)
        .order("month", { ascending: true }),
      supabase
        .from("penalty_events")
        .select("cents, reason")
        .eq("user_id", user.id)
        .gte("event_date", monthStartStr),
    ]);

  const liveEvents = (liveEventsResult.data || []) as { cents: number; reason: string }[];
  const liveMonthChargedCents = liveEvents
    .filter((e) => e.reason === "miss")
    .reduce((sum, e) => sum + e.cents, 0);
  const liveMonthForgivenCents = Math.abs(
    liveEvents
      .filter((e) => e.reason === "forgiven")
      .reduce((sum, e) => sum + e.cents, 0)
  );

  return {
    debts: (debtsResult.data as HabitDebt[]) || [],
    meta: metaResult.data as HabitDebtMeta | null,
    unsettledMonths: (unsettledMonthsResult.data as PenaltyMonth[]) || [],
    liveMonthChargedCents,
    liveMonthForgivenCents,
  };
}

/**
 * Enters Recovery Mode (pauses charges for 14 days).
 */
export async function enterRecoveryMode(): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  // Check cooldown
  const { data: meta } = await supabase
    .from("habit_debt_meta")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (meta?.recovery_cooldown_until && meta.recovery_cooldown_until >= today) {
    return { error: `Recovery mode available after ${meta.recovery_cooldown_until}` };
  }

  if (meta?.recovery_mode_active) {
    return { error: "Recovery mode already active" };
  }

  const deadline = addDays(today, 14);

  await supabase.from("habit_debt_meta").upsert(
    {
      user_id: user.id,
      recovery_mode_active: true,
      recovery_mode_start: today,
      recovery_mode_deadline: deadline,
      recovery_streak: 0,
      recovery_cooldown_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  revalidatePath("/dashboard");
  revalidatePath("/goals");
  return {};
}

/**
 * Exits Recovery Mode.
 */
export async function exitRecoveryMode(forced: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  const update: Record<string, unknown> = {
    recovery_mode_active: false,
    recovery_mode_start: null,
    recovery_mode_deadline: null,
    recovery_streak: 0,
    updated_at: new Date().toISOString(),
  };

  if (forced) {
    update.recovery_cooldown_until = addDays(today, 3);
  }

  await supabase.from("habit_debt_meta").update(update).eq("user_id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/goals");
  return {};
}

/**
 * Settles a penalty month (marks as paid).
 */
export async function settlePenaltyMonth(
  penaltyMonthId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("penalty_months")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", penaltyMonthId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  return {};
}

/**
 * Updates NR settings for a built-in habit.
 * Upserts a fresh habit_debt row when enabled.
 */
export async function updateBuiltinHabitNRSettings(
  habitType: "creatine" | "magnesium" | "gym",
  enabled: boolean,
  isHard: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  const update: Record<string, unknown> = {
    [`${habitType}_nr_enabled`]: enabled,
    [`${habitType}_nr_is_hard`]: isHard,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) return { error: error.message };

  if (enabled) {
    // Upsert fresh debt row
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
        lifetime_unpaid_cents: 0,
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
 * Upserts a fresh habit_debt row when enabled.
 */
export async function updateCustomHabitNRSettings(
  habitId: string,
  enabled: boolean,
  isHard: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const today = new Date().toISOString().split("T")[0];

  // Ownership check
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
      nr_is_hard: isHard,
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
        lifetime_unpaid_cents: 0,
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
