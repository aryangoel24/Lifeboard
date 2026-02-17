"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HabitCard } from "@/components/habit-card";
import { CustomHabitCard } from "@/components/custom-habit-card";
import { isHabitScheduledForDate } from "@/lib/habit-utils";
import type { CustomHabit, HabitEntry, Profile } from "@/types/database";

interface HabitsSectionProps {
  date: string;
  profile: Profile;
  todayHabits: HabitEntry[];
  customHabits: CustomHabit[];
  customHabitEntries: HabitEntry[];
}

export function HabitsSection({
  date,
  profile,
  todayHabits,
  customHabits,
  customHabitEntries,
}: HabitsSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const creatineEntry = todayHabits.find((h) => h.habit_type === "creatine");
  const magnesiumEntry = todayHabits.find((h) => h.habit_type === "magnesium");
  const gymEntry = todayHabits.find((h) => h.habit_type === "gym");

  // Filter custom habits scheduled for this date
  const scheduledHabits = customHabits.filter((h) =>
    isHabitScheduledForDate(h, date)
  );

  // Count completions
  const hardcodedDone = [
    creatineEntry && creatineEntry.value >= (profile.creatine_goal ?? 2),
    magnesiumEntry && magnesiumEntry.value >= 1,
    gymEntry && gymEntry.value >= 1,
  ].filter(Boolean).length;

  const customDone = scheduledHabits.filter((h) => {
    const entry = customHabitEntries.find(
      (e) => e.custom_habit_id === h.id
    );
    if (!entry) return false;
    if (h.tracking_type === "checkbox") return entry.value >= 1;
    return entry.value >= h.target_value;
  }).length;

  const totalDone = hardcodedDone + customDone;
  const totalHabits = 3 + scheduledHabits.length;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left mb-3"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Habits
          </h2>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            totalDone === totalHabits
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
              : "text-muted-foreground"
          )}>
            {totalDone}/{totalHabits} done
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HabitCard
            key={`creatine-${date}`}
            habitType="creatine"
            currentValue={creatineEntry?.value ?? 0}
            goal={profile.creatine_goal ?? 2}
            date={date}
          />
          <HabitCard
            key={`magnesium-${date}`}
            habitType="magnesium"
            currentValue={magnesiumEntry?.value ?? 0}
            goal={1}
            date={date}
          />
          <HabitCard
            key={`gym-${date}`}
            habitType="gym"
            currentValue={gymEntry?.value ?? 0}
            goal={1}
            date={date}
          />
          {scheduledHabits.map((habit) => (
            <CustomHabitCard
              key={`custom-${habit.id}-${date}`}
              habit={habit}
              entry={customHabitEntries.find(
                (e) => e.custom_habit_id === habit.id
              )}
              date={date}
            />
          ))}
        </div>
      )}
    </div>
  );
}
