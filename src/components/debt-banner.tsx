"use client";

import { DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatCents, getHabitDisplayName, getMondayOfWeek } from "@/lib/habit-debt-utils";
import type { HabitDebt, CustomHabit } from "@/types/database";

interface DebtBannerProps {
  debts: HabitDebt[];
  customHabits: CustomHabit[];
  currentWeekTotalCents: number;
  today: string;
}

export function DebtBanner({
  debts,
  customHabits,
  currentWeekTotalCents,
  today,
}: DebtBannerProps) {
  if (currentWeekTotalCents === 0) return null;

  const monday = getMondayOfWeek(today);
  const weekLabel = format(new Date(monday + "T12:00:00"), "MMM d");

  const topMissers = [...debts]
    .filter((d) => d.consecutive_miss_days > 0)
    .sort((a, b) => b.consecutive_miss_days - a.consecutive_miss_days)
    .slice(0, 4);

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-sm font-semibold">Habit Debt This Week</span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Resets into total owed every Monday
          </p>
        </div>
        <span className="text-sm font-bold text-red-600 dark:text-red-400">
          {formatCents(currentWeekTotalCents)}
        </span>
      </div>

      {topMissers.length > 0 && (
        <div className="space-y-2">
          {topMissers.map((d) => {
            const name = getHabitDisplayName(d.habit_type, d.custom_habit_id, customHabits);
            const pct = Math.min(100, (d.consecutive_miss_days / 7) * 100);
            const amount = formatCents(d.current_week_unpaid_cents);
            return (
              <div key={d.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">
                    {d.consecutive_miss_days}d miss · {amount}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Week of {weekLabel}</p>
    </div>
  );
}
