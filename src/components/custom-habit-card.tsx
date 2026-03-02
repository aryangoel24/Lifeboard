"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { logCustomHabit } from "@/lib/actions/custom-habits";
import { Check, Minus, Plus } from "lucide-react";
import type { CustomHabit, HabitDebt, HabitEntry } from "@/types/database";
import { formatCents } from "@/lib/habit-debt-utils";

interface CustomHabitCardProps {
  habit: CustomHabit;
  entry: HabitEntry | undefined;
  date: string;
  isFallingBehind?: boolean;
  debt?: HabitDebt;
}

export function CustomHabitCard({ habit, entry, date, isFallingBehind, debt }: CustomHabitCardProps) {
  const [value, setValue] = useState(entry?.value ?? 0);
  const [saving, setSaving] = useState(false);

  async function handleUpdate(newValue: number) {
    setSaving(true);
    const prev = value;
    setValue(newValue);
    const result = await logCustomHabit(habit.id, newValue, date);
    if (result.error) {
      toast.error(result.error);
      setValue(prev);
    }
    setSaving(false);
  }

  if (habit.tracking_type === "counter") {
    const goal = habit.target_value;
    const counterDone = value >= goal;
    return (
      <Card className={`glass-card rounded-2xl${isFallingBehind ? " border-amber-400 dark:border-amber-600" : ""}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span>{habit.icon}</span>
            {habit.name}
            {isFallingBehind && !counterDone && (
              <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">Falling behind</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={saving || value <= 0}
                onClick={() => handleUpdate(value - 1)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-lg font-semibold tabular-nums">
                {value}/{goal}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={saving}
                onClick={() => handleUpdate(value + 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {value >= goal && (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {value >= goal ? "Goal reached" : `${goal - value} remaining`}
          </p>
          {debt && debt.lifetime_unpaid_cents > 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
              {formatCents(debt.lifetime_unpaid_cents)} owed · {debt.debt_count} debt
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (habit.tracking_type === "duration") {
    const target = habit.target_value;
    const durationDone = value >= target;
    return (
      <Card className={`glass-card rounded-2xl${isFallingBehind ? " border-amber-400 dark:border-amber-600" : ""}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span>{habit.icon}</span>
            {habit.name}
            {isFallingBehind && !durationDone && (
              <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">Falling behind</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              value={value || ""}
              placeholder="0"
              className="w-20 h-8"
              disabled={saving}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setValue(v);
              }}
              onBlur={() => handleUpdate(value)}
            />
            <span className="text-sm text-muted-foreground">
              / {target} min
            </span>
            {value >= target && (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>
          {debt && debt.lifetime_unpaid_cents > 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
              {formatCents(debt.lifetime_unpaid_cents)} owed · {debt.debt_count} debt
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // checkbox (default)
  const isDone = value >= 1;
  return (
    <Card className={isFallingBehind ? "border-amber-400 dark:border-amber-600" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span>{habit.icon}</span>
          {habit.name}
          {isFallingBehind && !isDone && (
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-medium">Falling behind</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          variant={isDone ? "default" : "outline"}
          className="w-full"
          disabled={saving}
          onClick={() => handleUpdate(isDone ? 0 : 1)}
        >
          {isDone ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Done
            </>
          ) : (
            "Mark as done"
          )}
        </Button>
        {debt && debt.lifetime_unpaid_cents > 0 && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
            {formatCents(debt.lifetime_unpaid_cents)} owed · {debt.debt_count} debt
          </div>
        )}
      </CardContent>
    </Card>
  );
}
