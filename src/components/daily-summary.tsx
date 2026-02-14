import { MacroStatCard, MACRO_CONFIG } from "@/components/macro-stat-card";
import type { FoodEntry, Profile } from "@/types/database";

interface DailySummaryProps {
  entries: FoodEntry[];
  profile: Profile;
}

export function DailySummary({ entries, profile }: DailySummaryProps) {
  const totals = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (Number(entry.protein) || 0),
      carbs: acc.carbs + (Number(entry.carbs) || 0),
      fat: acc.fat + (Number(entry.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
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
  );
}
