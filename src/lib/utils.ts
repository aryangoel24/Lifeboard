import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import type { MealCategory } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM-dd");
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMMM d, yyyy");
}

export function getDayRange(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return {
    start: startOfDay(d).toISOString(),
    end: endOfDay(d).toISOString(),
  };
}

export function calcIngredientTotals(
  ingredients: Array<{ calories?: number; protein?: number; carbs?: number; fat?: number }>
): { calories: number; protein: number; carbs: number; fat: number } {
  return ingredients.reduce(
    (acc: { calories: number; protein: number; carbs: number; fat: number }, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/** Returns the current hour in browser-local time. Use in client components only. */
export function clientNowHour(): number {
  return new Date().getHours();
}

export function getDefaultMealCategory(hour: number): MealCategory {
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
}
