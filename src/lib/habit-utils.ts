import type { CustomHabit, HabitEntry } from "@/types/database";

export type HabitWeeklyStats = {
  creatineCompletionPct: number;
  magnesiumCompletionPct: number;
  gymDays: number;
  gymGoal: number;
  totalDays: number;
};

export function computeHabitWeeklyStats(
  entries: HabitEntry[],
  creatineGoal: number,
  gymGoal: number,
  days: number = 7
): HabitWeeklyStats {
  const creatineEntries = entries.filter((e) => e.habit_type === "creatine" && e.value >= creatineGoal);
  const magnesiumEntries = entries.filter((e) => e.habit_type === "magnesium" && e.value >= 1);
  const gymEntries = entries.filter((e) => e.habit_type === "gym" && e.value >= 1);

  return {
    creatineCompletionPct: days > 0 ? Math.round((creatineEntries.length / days) * 100) : 0,
    magnesiumCompletionPct: days > 0 ? Math.round((magnesiumEntries.length / days) * 100) : 0,
    gymDays: gymEntries.length,
    gymGoal,
    totalDays: days,
  };
}

export type DailyHabitData = {
  date: string;
  creatine: number;
  magnesium: number;
  gym: number;
};

export function computeDailyHabitData(entries: HabitEntry[], days: number = 30): DailyHabitData[] {
  const now = new Date();
  const result: DailyHabitData[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayEntries = entries.filter((e) => e.logged_at === dateStr);

    result.push({
      date: dateStr,
      creatine: dayEntries.find((e) => e.habit_type === "creatine")?.value ?? 0,
      magnesium: dayEntries.find((e) => e.habit_type === "magnesium")?.value ?? 0,
      gym: dayEntries.find((e) => e.habit_type === "gym")?.value ?? 0,
    });
  }

  return result;
}

/**
 * Checks if a custom habit is scheduled for a given date based on its frequency.
 * - daily: always scheduled
 * - weekdays: Mon-Fri (getDay() 1-5)
 * - custom: only on days in frequency_days (0=Sun, 1=Mon, ..., 6=Sat)
 */
export function isHabitScheduledForDate(habit: CustomHabit, dateStr: string): boolean {
  if (habit.frequency === "daily") return true;

  const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();

  if (habit.frequency === "weekdays") {
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }

  if (habit.frequency === "custom" && habit.frequency_days) {
    return habit.frequency_days.includes(dayOfWeek);
  }

  return true;
}
