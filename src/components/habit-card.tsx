"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logHabit } from "@/lib/actions/habits";
import { Pill, Dumbbell, Check, Minus, Plus, Tablet } from "lucide-react";
import type { HabitDebt } from "@/types/database";
import { formatCents } from "@/lib/habit-debt-utils";
type BuiltinHabitType = "creatine" | "magnesium" | "gym";

interface HabitCardProps {
  habitType: BuiltinHabitType;
  currentValue: number;
  goal: number;
  date: string;
  isFallingBehind?: boolean;
  debt?: HabitDebt;
}

const HABIT_CONFIG = {
  creatine: {
    label: "Creatine",
    icon: Pill,
    iconColor: "text-blue-500",
    unit: "servings",
  },
  magnesium: {
    label: "Magnesium",
    icon: Tablet,
    iconColor: "text-purple-500",
    unit: "",
  },
  gym: {
    label: "Gym",
    icon: Dumbbell,
    iconColor: "text-orange-500",
    unit: "",
  },
} as const;

export function HabitCard({ habitType, currentValue, goal, date, isFallingBehind, debt }: HabitCardProps) {
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const config = HABIT_CONFIG[habitType];
  const Icon = config.icon;

  async function handleUpdate(newValue: number) {
    setSaving(true);
    setValue(newValue);
    const result = await logHabit(habitType, newValue, date);
    if (result.error) {
      toast.error(result.error);
      setValue(value); // revert
    }
    setSaving(false);
  }

  // Counter mode for creatine
  if (habitType === "creatine") {
    const creatineDone = value >= goal;
    return (
      <Card className={`glass-card rounded-2xl${isFallingBehind ? " border-amber-400 dark:border-amber-600" : ""}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.iconColor}`} />
            {config.label}
            {isFallingBehind && !creatineDone && (
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
            {value >= goal ? "Goal reached" : `${goal - value} ${config.unit} remaining`}
          </p>
          {debt && debt.lifetime_unpaid_cents > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {formatCents(debt.lifetime_unpaid_cents)} owed · {debt.debt_count} debt
                </span>
              </div>
              {debt.completions_pending > 0 && (
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(debt.completions_pending / (debt.consecutive_miss_days > 0 ? 1 : 1)) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Checkbox mode for magnesium and gym
  const isDone = value >= 1;

  return (
    <Card className={isFallingBehind ? "border-amber-400 dark:border-amber-600" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
          {config.label}
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
