import { MacroStatCard, MACRO_CONFIG } from "@/components/macro-stat-card";
import type { FoodEntry, Profile } from "@/types/database";

interface DailySummaryProps {
  entries: FoodEntry[];
  profile: Profile;
  showMealGaps?: boolean;
  currentHour?: number;
}

export function DailySummary({ entries, profile, showMealGaps = false, currentHour = 12 }: DailySummaryProps) {
  const totals = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (Number(entry.protein) || 0),
      carbs: acc.carbs + (Number(entry.carbs) || 0),
      fat: acc.fat + (Number(entry.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Meal gap detection: check which meals are missing based on current time
  const loggedMeals = new Set(entries.map((e) => e.meal_category));
  const hour = currentHour;
  const missingMeals: string[] = [];

  if (showMealGaps) {
    if (hour >= 10 && !loggedMeals.has("breakfast")) missingMeals.push("breakfast");
    if (hour >= 14 && !loggedMeals.has("lunch")) missingMeals.push("lunch");
    if (hour >= 20 && !loggedMeals.has("dinner")) missingMeals.push("dinner");
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MacroStatCard
          label="Calories"
          current={totals.calories}
          goal={profile.daily_calories_goal}
          unit="cal"
          icon={MACRO_CONFIG.calories.icon}
          color={MACRO_CONFIG.calories.color}
          bgColor={MACRO_CONFIG.calories.bgColor}
        />
        <MacroStatCard
          label="Protein"
          current={totals.protein}
          goal={profile.daily_protein_goal}
          unit="g"
          icon={MACRO_CONFIG.protein.icon}
          color={MACRO_CONFIG.protein.color}
          bgColor={MACRO_CONFIG.protein.bgColor}
          higherIsBetter
        />
        <MacroStatCard
          label="Carbs"
          current={totals.carbs}
          goal={profile.daily_carbs_goal}
          unit="g"
          icon={MACRO_CONFIG.carbs.icon}
          color={MACRO_CONFIG.carbs.color}
          bgColor={MACRO_CONFIG.carbs.bgColor}
        />
        <MacroStatCard
          label="Fat"
          current={totals.fat}
          goal={profile.daily_fat_goal}
          unit="g"
          icon={MACRO_CONFIG.fat.icon}
          color={MACRO_CONFIG.fat.color}
          bgColor={MACRO_CONFIG.fat.bgColor}
        />
      </div>
      {missingMeals.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          You haven&apos;t logged {missingMeals.join(", ")} yet today
        </p>
      )}
    </div>
  );
}
