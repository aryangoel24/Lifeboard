"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Shield, Clock, TrendingDown, DollarSign } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  settlePenaltyMonth,
  enterRecoveryMode,
  exitRecoveryMode,
} from "@/lib/actions/habit-debt";
import { formatCents, getHabitDisplayName } from "@/lib/habit-debt-utils";
import type { HabitDebt, HabitDebtMeta, PenaltyMonth, CustomHabit } from "@/types/database";

interface GoalsAccountabilitySectionProps {
  debts: HabitDebt[];
  meta: HabitDebtMeta | null;
  unsettledMonths: PenaltyMonth[];
  customHabits: CustomHabit[];
  liveMonthChargedCents: number;
  liveMonthForgivenCents: number;
  today: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

export function GoalsAccountabilitySection({
  debts,
  meta,
  unsettledMonths,
  customHabits,
  liveMonthChargedCents,
  liveMonthForgivenCents,
  today,
}: GoalsAccountabilitySectionProps) {
  const [loading, setLoading] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);

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

  const totalOwed = debts.reduce((sum, d) => sum + d.lifetime_unpaid_cents, 0);
  const canEnterRecovery = !isRecoveryActive && !hasCooldown && totalOwed >= 500;

  async function handleSettle(monthId: string) {
    setSettlingId(monthId);
    const result = await settlePenaltyMonth(monthId);
    if (result.error) toast.error(result.error);
    else toast.success("Month settled");
    setSettlingId(null);
  }

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

  const activeDebts = debts.filter((d) => d.lifetime_unpaid_cents > 0 || d.debt_count > 0);

  if (activeDebts.length === 0 && unsettledMonths.length === 0 && !isRecoveryActive) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Habit Accountability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Per-habit table */}
        {activeDebts.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Active Debt
            </p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left p-2 pl-3 text-xs font-medium text-muted-foreground">Habit</th>
                    <th className="text-right p-2 text-xs font-medium text-muted-foreground">Debt</th>
                    <th className="text-right p-2 text-xs font-medium text-muted-foreground">Owed</th>
                    <th className="text-right p-2 pr-3 text-xs font-medium text-muted-foreground">Miss streak</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDebts.map((debt) => (
                    <tr key={debt.id} className="border-b last:border-0">
                      <td className="p-2 pl-3 font-medium">
                        {getHabitDisplayName(debt.habit_type, debt.custom_habit_id, customHabits)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{debt.debt_count}</td>
                      <td className="p-2 text-right tabular-nums text-red-600 dark:text-red-400">
                        {formatCents(debt.lifetime_unpaid_cents)}
                      </td>
                      <td className="p-2 pr-3 text-right tabular-nums">
                        {debt.consecutive_miss_days > 0 ? (
                          <span className="flex items-center justify-end gap-1">
                            <TrendingDown className="h-3 w-3 text-amber-500" />
                            {debt.consecutive_miss_days}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live month stats */}
        {(liveMonthChargedCents > 0 || liveMonthForgivenCents > 0) && (
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">This month: </span>
              <span className="font-medium">{formatCents(liveMonthChargedCents)} charged</span>
              {liveMonthForgivenCents > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {formatCents(liveMonthForgivenCents)} forgiven
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Unsettled months */}
        {unsettledMonths.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Unpaid Months
            </p>
            {unsettledMonths.map((month) => (
              <div
                key={month.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <p className="text-sm font-medium">{formatMonth(month.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(month.total_cents)} owed
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={settlingId === month.id}
                  onClick={() => handleSettle(month.id)}
                >
                  {settlingId === month.id ? "Settling..." : `Settle ${formatCents(month.total_cents)}`}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Recovery Mode */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                Recovery Mode
              </p>
              <p className="text-xs text-muted-foreground">
                Pauses penalty charges for 14 days. Requires 70% scheduled completion to maintain.
              </p>
            </div>
          </div>

          {isRecoveryActive && (
            <div className="flex items-center justify-between bg-blue-500/10 rounded-lg p-2">
              <div className="text-sm">
                <span className="font-medium text-blue-600 dark:text-blue-400">Active</span>
                <span className="text-muted-foreground"> · {recoveryDaysLeft} days remaining</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={handleExitRecovery}
              >
                Exit Recovery
              </Button>
            </div>
          )}

          {hasCooldown && !isRecoveryActive && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Available in {cooldownDaysLeft} days (cooldown after exit)</span>
            </div>
          )}

          {canEnterRecovery && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-blue-500/40 text-blue-600 dark:text-blue-400"
              onClick={handleEnterRecovery}
              disabled={loading}
            >
              <Shield className="h-4 w-4 mr-2" />
              Enter Recovery Mode
            </Button>
          )}

          {!isRecoveryActive && !hasCooldown && totalOwed < 500 && (
            <p className="text-xs text-muted-foreground">
              Available when you owe $5 or more.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
