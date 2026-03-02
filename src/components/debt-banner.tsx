"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  enterRecoveryMode,
  exitRecoveryMode,
} from "@/lib/actions/habit-debt";
import { formatCents, getHabitDisplayName } from "@/lib/habit-debt-utils";
import type { HabitDebt, HabitDebtMeta, CustomHabit } from "@/types/database";

interface DebtBannerProps {
  debts: HabitDebt[];
  meta: HabitDebtMeta | null;
  customHabits: CustomHabit[];
  liveMonthChargedCents: number;
  liveMonthForgivenCents: number;
  today: string;
}

export function DebtBanner({
  debts,
  meta,
  customHabits,
  liveMonthChargedCents,
  liveMonthForgivenCents,
  today,
}: DebtBannerProps) {
  const [loading, setLoading] = useState(false);

  const totalOwed = debts.reduce((sum, d) => sum + d.lifetime_unpaid_cents, 0);

  // Top habits by consecutive miss days
  const topMissers = [...debts]
    .filter((d) => d.consecutive_miss_days > 0)
    .sort((a, b) => b.consecutive_miss_days - a.consecutive_miss_days)
    .slice(0, 3);

  // Recovery mode state
  const isRecoveryActive = meta?.recovery_mode_active ?? false;
  const hasCooldown =
    meta?.recovery_cooldown_until && meta.recovery_cooldown_until >= today;
  const cooldownDaysLeft = hasCooldown
    ? Math.ceil(
        (new Date(meta!.recovery_cooldown_until! + "T12:00:00").getTime() -
          new Date(today + "T12:00:00").getTime()) /
          86400000
      )
    : 0;

  const recoveryDaysLeft = isRecoveryActive && meta?.recovery_mode_deadline
    ? Math.ceil(
        (new Date(meta.recovery_mode_deadline + "T12:00:00").getTime() -
          new Date(today + "T12:00:00").getTime()) /
          86400000
      )
    : 0;

  const canEnterRecovery = !isRecoveryActive && !hasCooldown && totalOwed >= 500;

  async function handleEnterRecovery() {
    setLoading(true);
    const result = await enterRecoveryMode();
    if (result.error) toast.error(result.error);
    else toast.success("Recovery mode active — charges paused for 14 days");
    setLoading(false);
  }

  async function handleExitRecovery() {
    setLoading(true);
    const result = await exitRecoveryMode(false);
    if (result.error) toast.error(result.error);
    else toast.success("Exited recovery mode");
    setLoading(false);
  }

  // Don't show if no debt
  if (totalOwed === 0 && !isRecoveryActive) return null;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        isRecoveryActive
          ? "border-blue-500/40 bg-blue-500/5"
          : "border-red-500/40 bg-red-500/5"
      )}
    >
      {/* Line 1: What you owe */}
      <div className="flex items-center gap-2">
        <AlertTriangle
          className={cn(
            "h-4 w-4 shrink-0",
            isRecoveryActive ? "text-blue-500" : "text-red-500"
          )}
        />
        <span className="text-sm font-semibold">
          Owed:{" "}
          <span className={isRecoveryActive ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}>
            {formatCents(totalOwed)} total
          </span>
          {" · "}
          <span className="text-muted-foreground font-normal">
            {formatCents(liveMonthChargedCents)} charged this month
          </span>
          {liveMonthForgivenCents > 0 && (
            <>
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400 font-normal">
                {formatCents(liveMonthForgivenCents)} forgiven
              </span>
            </>
          )}
        </span>
      </div>

      {/* Line 2: Top miss drivers */}
      {topMissers.length > 0 && (
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {topMissers.map((d) => {
            const name = getHabitDisplayName(d.habit_type, d.custom_habit_id, customHabits);
            const tierCents = d.consecutive_miss_days >= 4 ? 1000 : d.consecutive_miss_days >= 2 ? 700 : 500;
            return (
              <span key={d.id} className="flex items-center gap-1">
                <span className="font-medium text-foreground">{name}</span>
                <span>({d.consecutive_miss_days}d miss, {formatCents(tierCents)}/day)</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Line 3: Action prompts + Recovery controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Forgiveness hints */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
          {debts
            .filter((d) => d.lifetime_unpaid_cents > 0)
            .slice(0, 2)
            .map((d) => {
              const name = getHabitDisplayName(d.habit_type, d.custom_habit_id, customHabits);
              const isHardHint =
                d.habit_type === "gym"
                  ? true
                  : d.habit_type === "creatine" || d.habit_type === "magnesium"
                  ? false
                  : customHabits.find((h) => h.id === d.custom_habit_id)?.nr_is_hard ?? false;
              return (
                <span key={d.id}>
                  Complete <span className="font-medium">{name}</span>{" "}
                  {isHardHint ? "to forgive $5" : "twice to forgive $5"}
                </span>
              );
            })}
        </div>

        {/* Recovery mode controls */}
        <div className="flex items-center gap-2">
          {isRecoveryActive && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                Recovery · {recoveryDaysLeft}d left
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={handleExitRecovery}
                disabled={loading}
              >
                Exit
              </Button>
            </div>
          )}

          {canEnterRecovery && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              onClick={handleEnterRecovery}
              disabled={loading}
            >
              <Shield className="h-3.5 w-3.5 mr-1" />
              Recovery Mode
            </Button>
          )}

          {hasCooldown && !isRecoveryActive && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Recovery in {cooldownDaysLeft}d
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
