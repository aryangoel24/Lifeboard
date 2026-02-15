import { FoodEntryCard } from "@/components/food-entry-card";
import { UtensilsCrossed } from "lucide-react";
import type { FoodEntry, MealCategory } from "@/types/database";

const MEAL_ORDER: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_LABELS: Record<MealCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface FoodEntryListProps {
  entries: FoodEntry[];
  userId: string;
  date: string;
}

export function FoodEntryList({ entries, userId, date }: FoodEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-2xl bg-muted p-4 mb-4">
          <UtensilsCrossed className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="font-medium text-base text-foreground">No entries yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">
          Add your first meal to start tracking today.
        </p>
      </div>
    );
  }

  const grouped = MEAL_ORDER.map((category) => ({
    category,
    label: MEAL_LABELS[category],
    items: entries.filter((e) => e.meal_category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.category} className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.items.map((entry) => (
              <FoodEntryCard
                key={entry.id}
                entry={entry}
                userId={userId}
                date={date}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
