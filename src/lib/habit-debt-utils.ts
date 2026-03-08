import type { CustomHabit, HabitEntry, HabitType } from "@/types/database";

export const FLAT_PENALTY_CENTS = 500; // $5 per missed day

/**
 * Returns the Monday (YYYY-MM-DD) of the ISO week containing `date`.
 */
export function getMondayOfWeek(date: string): string {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/**
 * Single abstraction to check if a habit is completed for a given date.
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
 * Adds `days` days to a YYYY-MM-DD string.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
