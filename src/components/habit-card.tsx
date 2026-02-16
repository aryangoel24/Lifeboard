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
import type { HabitType } from "@/types/database";

interface HabitCardProps {
  habitType: HabitType;
  currentValue: number;
  goal: number;
  date: string;
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

export function HabitCard({ habitType, currentValue, goal, date }: HabitCardProps) {
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
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.iconColor}`} />
            {config.label}
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
                disabled={saving || value >= goal}
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
        </CardContent>
      </Card>
    );
  }

  // Checkbox mode for magnesium and gym
  const isDone = value >= 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
          {config.label}
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
      </CardContent>
    </Card>
  );
}
