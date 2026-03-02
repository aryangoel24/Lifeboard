import type { CustomHabit, HabitEntry, HabitType } from "@/types/database";

/**
 * Returns the daily penalty in cents based on consecutive miss days.
 * Tier 1: 1 miss = $5, Tier 2: 2-3 = $7, Tier 3: 4+ = $10
 */
export function getPenaltyTierCents(consecutiveMissDays: number): number {
  if (consecutiveMissDays >= 4) return 1000;
  if (consecutiveMissDays >= 2) return 700;
  return 500;
}

/**
 * Returns forgiveness per completion event in cents.
 * Hard: $5 (500 cents), Soft: $2.50 (250 cents)
 */
export function getForgivenessCents(isHard: boolean): number {
  return isHard ? 500 : 250;
}

/**
 * Returns a frequency weight for cap priority tiebreaking.
 * Higher = more frequently scheduled = higher priority for charges.
 * daily=3, weekdays=2, custom=1
 */
export function getHabitFrequencyWeight(habit: CustomHabit | null): number {
  if (!habit) return 3; // Built-in habits are daily
  if (habit.frequency === "daily") return 3;
  if (habit.frequency === "weekdays") return 2;
  return 1;
}

export type CapCandidate = {
  habitType: HabitType;
  customHabitId: string | null;
  consecutiveMissDays: number;
  frequencyWeight: number;
  cents: number;
};

export type CapResult = {
  charged: CapCandidate[];
  skipped: CapCandidate[];
};

const GLOBAL_DAILY_CAP_CENTS = 2000;

/**
 * Applies the $20/day global cap to penalty candidates.
 * Priority: highest consecutiveMissDays → highest frequencyWeight → habit_id (stable sort)
 */
export function applyGlobalDailyCap(candidates: CapCandidate[]): CapResult {
  const sorted = [...candidates].sort((a, b) => {
    if (b.consecutiveMissDays !== a.consecutiveMissDays) {
      return b.consecutiveMissDays - a.consecutiveMissDays;
    }
    if (b.frequencyWeight !== a.frequencyWeight) {
      return b.frequencyWeight - a.frequencyWeight;
    }
    // Stable tiebreak by habit ID (builtin types alphabetically, then custom by uuid)
    const aId = a.customHabitId ?? a.habitType;
    const bId = b.customHabitId ?? b.habitType;
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });

  let remaining = GLOBAL_DAILY_CAP_CENTS;
  const charged: CapCandidate[] = [];
  const skipped: CapCandidate[] = [];

  for (const candidate of sorted) {
    if (remaining >= candidate.cents) {
      charged.push(candidate);
      remaining -= candidate.cents;
    } else {
      skipped.push(candidate);
    }
  }

  return { charged, skipped };
}

/**
 * Computes recovery compliance: ratio of scheduled habit completions to commitments
 * in the last `days` days window.
 * Returns 1.0 if there are no scheduled commitments (no false exits).
 */
export function computeRecoveryCompliance(
  builtinEntries: HabitEntry[],
  customEntries: HabitEntry[],
  customHabits: CustomHabit[],
  optedInHabits: Array<{ habitType: HabitType; customHabitId: string | null; isHard: boolean }>,
  creatineGoal: number,
  today: string,
  days: number = 7
): number {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  let commitments = 0;
  let completions = 0;

  for (const opted of optedInHabits) {
    for (const date of dates) {
      let scheduled = false;
      if (opted.habitType !== "custom") {
        // Built-in habits are daily
        scheduled = true;
      } else {
        const habit = customHabits.find((h) => h.id === opted.customHabitId);
        if (habit) {
          scheduled = isHabitScheduledForDate(habit, date);
        }
      }

      if (!scheduled) continue;
      commitments++;

      const completed = isHabitCompletedForDate(
        opted.habitType,
        opted.customHabitId,
        builtinEntries,
        customEntries,
        customHabits.find((h) => h.id === opted.customHabitId) ?? null,
        creatineGoal,
        date
      );
      if (completed) completions++;
    }
  }

  if (commitments === 0) return 1.0;
  return completions / commitments;
}

/**
 * Single abstraction to check if a habit is completed for a given date.
 * Hides all habit type differences.
 */
export function isHabitCompletedForDate(
  habitType: HabitType,
  customHabitId: string | null,
  builtinEntries: HabitEntry[],
  customEntries: HabitEntry[],
  habit: CustomHabit | null,
  creatineGoal: number,
  date: string
): boolean {
  if (habitType === "custom" && customHabitId) {
    const entry = customEntries.find(
      (e) => e.custom_habit_id === customHabitId && e.logged_at === date
    );
    if (!entry) return false;
    if (!habit) return entry.value >= 1;
    if (habit.tracking_type === "checkbox") return entry.value >= 1;
    return entry.value >= habit.target_value;
  }

  const entry = builtinEntries.find(
    (e) => e.habit_type === habitType && e.logged_at === date
  );
  if (!entry) return false;

  if (habitType === "creatine") return entry.value >= creatineGoal;
  return entry.value >= 1;
}

/**
 * Checks if a custom habit is scheduled for a given date.
 */
export function isHabitScheduledForDate(habit: CustomHabit, dateStr: string): boolean {
  if (habit.frequency === "daily") return true;
  const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
  if (habit.frequency === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (habit.frequency === "custom" && habit.frequency_days) {
    return habit.frequency_days.includes(dayOfWeek);
  }
  return true;
}

/**
 * Adds one day to a YYYY-MM-DD string.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Returns the first day of the month for a given date string.
 */
export function getMonthStart(dateStr: string): string {
  return dateStr.substring(0, 7) + "-01";
}

/**
 * Checks if two dates are in the same month.
 */
export function isSameMonth(a: string, b: string): boolean {
  return a.substring(0, 7) === b.substring(0, 7);
}

/**
 * Returns all month starts between two dates (exclusive of start, inclusive of end).
 */
export function getMonthBoundariesBetween(from: string, to: string): string[] {
  const boundaries: string[] = [];
  let current = from;
  while (current < to) {
    const next = addDays(current, 1);
    if (!isSameMonth(current, next) && next <= to) {
      boundaries.push(getMonthStart(next));
    }
    current = next;
  }
  return boundaries;
}

/**
 * Returns a formatted dollar amount from cents.
 */
export function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Get display name for a habit (built-in or custom).
 */
export function getHabitDisplayName(
  habitType: HabitType,
  customHabitId: string | null,
  customHabits: CustomHabit[]
): string {
  if (habitType === "custom" && customHabitId) {
    const habit = customHabits.find((h) => h.id === customHabitId);
    return habit?.name ?? "Custom Habit";
  }
  return habitType.charAt(0).toUpperCase() + habitType.slice(1);
}
