import type { CustomHabit, HabitEntry } from "@/types/database";
import { isHabitScheduledForDate } from "@/lib/habit-debt-utils";

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

export type SingleHabitTrendData = {
  points: { date: string; value: number }[];
  goal: number;
};

export function computeSingleHabitTrendData(
  id: string,
  isCustom: boolean,
  builtinEntries: HabitEntry[],
  customEntries: HabitEntry[],
  goal: number,
  days: number = 30
): SingleHabitTrendData {
  const now = new Date();
  const points: { date: string; value: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    if (isCustom) {
      const entry = customEntries.find(
        (e) => e.custom_habit_id === id && e.logged_at === dateStr
      );
      points.push({ date: dateStr, value: entry?.value ?? 0 });
    } else {
      const entry = builtinEntries.find(
        (e) => e.habit_type === id && e.logged_at === dateStr
      );
      points.push({ date: dateStr, value: entry?.value ?? 0 });
    }
  }

  return { points, goal };
}

export function computeHabitFallingBehind(
  builtinEntries: HabitEntry[],
  customEntries: HabitEntry[],
  customHabits: CustomHabit[],
  creatineGoal: number,
  today: string,
  days: number = 7
): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  // Generate the last `days` days inclusive of today
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // Built-in habits
  const builtinChecks: Array<{ id: string; goal: number }> = [
    { id: "creatine", goal: creatineGoal },
    { id: "magnesium", goal: 1 },
    { id: "gym", goal: 1 },
  ];

  for (const { id, goal } of builtinChecks) {
    const missedCount = dates.filter((date) => {
      const entry = builtinEntries.find(
        (e) => e.habit_type === id && e.logged_at === date
      );
      return !entry || entry.value < goal;
    }).length;
    result[id] = missedCount >= 2;
  }

  // Custom habits — only count scheduled days
  for (const habit of customHabits) {
    const scheduledDates = dates.filter((date) =>
      isHabitScheduledForDate(habit, date)
    );
    if (scheduledDates.length < 2) {
      result[habit.id] = false;
      continue;
    }
    const missedCount = scheduledDates.filter((date) => {
      const entry = customEntries.find(
        (e) => e.custom_habit_id === habit.id && e.logged_at === date
      );
      if (!entry) return true;
      if (habit.tracking_type === "checkbox") return entry.value < 1;
      return entry.value < habit.target_value;
    }).length;
    result[habit.id] = missedCount >= 2;
  }

  return result;
}

export { isHabitScheduledForDate } from "@/lib/habit-debt-utils";
