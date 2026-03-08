"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HabitCard } from "@/components/habit-card";
import { CustomHabitCard } from "@/components/custom-habit-card";
import { DebtBanner } from "@/components/debt-banner";
import { isHabitScheduledForDate, computeHabitFallingBehind } from "@/lib/habit-utils";
import type { CustomHabit, HabitDebt, HabitEntry, Profile } from "@/types/database";

interface HabitsSectionProps {
  date: string;
  today: string;
  profile: Profile;
  todayHabits: HabitEntry[];
  customHabits: CustomHabit[];
  customHabitEntries: HabitEntry[];
  weeklyHabitEntries: HabitEntry[];
  weeklyCustomHabitEntries: HabitEntry[];
  debts: HabitDebt[];
  currentWeekTotalCents: number;
}

export function HabitsSection({
  date,
  today,
  profile,
  todayHabits,
  customHabits,
  customHabitEntries,
  weeklyHabitEntries,
  weeklyCustomHabitEntries,
  debts,
  currentWeekTotalCents,
}: HabitsSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const fallingBehindMap = computeHabitFallingBehind(
    weeklyHabitEntries,
    weeklyCustomHabitEntries,
    customHabits,
    profile.creatine_goal ?? 2,
    date
  );

  const creatineEntry = todayHabits.find((h) => h.habit_type === "creatine");
  const magnesiumEntry = todayHabits.find((h) => h.habit_type === "magnesium");
  const gymEntry = todayHabits.find((h) => h.habit_type === "gym");

  const scheduledHabits = customHabits.filter((h) =>
    isHabitScheduledForDate(h, date)
  );

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

  const getDebt = (habitType: string, customHabitId?: string): HabitDebt | undefined => {
    return debts.find((d) =>
      customHabitId
        ? d.custom_habit_id === customHabitId
        : d.habit_type === habitType && d.custom_habit_id === null
    );
  };

  return (
    <div className="space-y-3">
      {currentWeekTotalCents > 0 && (
        <DebtBanner
          debts={debts}
          customHabits={customHabits}
          currentWeekTotalCents={currentWeekTotalCents}
          today={today}
        />
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
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
            isFallingBehind={fallingBehindMap["creatine"]}
            debt={getDebt("creatine")}
          />
          <HabitCard
            key={`magnesium-${date}`}
            habitType="magnesium"
            currentValue={magnesiumEntry?.value ?? 0}
            goal={1}
            date={date}
            isFallingBehind={fallingBehindMap["magnesium"]}
            debt={getDebt("magnesium")}
          />
          <HabitCard
            key={`gym-${date}`}
            habitType="gym"
            currentValue={gymEntry?.value ?? 0}
            goal={1}
            date={date}
            isFallingBehind={fallingBehindMap["gym"]}
            debt={getDebt("gym")}
          />
          {scheduledHabits.map((habit) => (
            <CustomHabitCard
              key={`custom-${habit.id}-${date}`}
              habit={habit}
              entry={customHabitEntries.find(
                (e) => e.custom_habit_id === habit.id
              )}
              date={date}
              isFallingBehind={fallingBehindMap[habit.id]}
              debt={getDebt("custom", habit.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
