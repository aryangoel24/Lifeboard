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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, Pill, Tablet, Dumbbell } from "lucide-react";
import { updateBuiltinHabitGoal } from "@/lib/actions/goals";
import { updateBuiltinHabitNRSettings } from "@/lib/actions/habit-debt";
import type { Profile } from "@/types/database";

export function BuiltinHabitsCard({ profile }: { profile: Profile }) {
  const [creatineGoal, setCreatineGoal] = useState(profile.creatine_goal);
  const [gymGoal, setGymGoal] = useState(profile.gym_weekly_goal);
  const [creatineInput, setCreatineInput] = useState(profile.creatine_goal);
  const [gymInput, setGymInput] = useState(profile.gym_weekly_goal);
  const [editingCreatine, setEditingCreatine] = useState(false);
  const [editingGym, setEditingGym] = useState(false);
  const [saving, setSaving] = useState(false);

  // NR state
  const [creatineNR, setCreatineNR] = useState({ enabled: profile.creatine_nr_enabled ?? false, isHard: profile.creatine_nr_is_hard ?? false });
  const [magnesiumNR, setMagnesiumNR] = useState({ enabled: profile.magnesium_nr_enabled ?? false, isHard: profile.magnesium_nr_is_hard ?? false });
  const [gymNR, setGymNR] = useState({ enabled: profile.gym_nr_enabled ?? false, isHard: profile.gym_nr_is_hard ?? true });
  const [savingNR, setSavingNR] = useState<string | null>(null);

  async function handleNRUpdate(
    type: "creatine" | "magnesium" | "gym",
    enabled: boolean,
    isHard: boolean
  ) {
    setSavingNR(type);
    const result = await updateBuiltinHabitNRSettings(type, enabled, isHard);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (type === "creatine") setCreatineNR({ enabled, isHard });
      if (type === "magnesium") setMagnesiumNR({ enabled, isHard });
      if (type === "gym") setGymNR({ enabled, isHard });
    }
    setSavingNR(null);
  }

  async function saveCreatine() {
    setSaving(true);
    const result = await updateBuiltinHabitGoal("creatine_goal", creatineInput);
    if (result.error) {
      toast.error(result.error);
    } else {
      setCreatineGoal(creatineInput);
      setEditingCreatine(false);
      toast.success("Creatine goal updated");
    }
    setSaving(false);
  }

  async function saveGym() {
    setSaving(true);
    const result = await updateBuiltinHabitGoal("gym_weekly_goal", gymInput);
    if (result.error) {
      toast.error(result.error);
    } else {
      setGymGoal(gymInput);
      setEditingGym(false);
      toast.success("Gym goal updated");
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Built-in Habits</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Pill className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Creatine</p>
                  <Badge variant="secondary" className="text-xs">
                    {creatineGoal} servings/day
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={creatineNR.enabled ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingNR === "creatine"}
                  onClick={() => handleNRUpdate("creatine", !creatineNR.enabled, creatineNR.isHard)}
                >
                  {creatineNR.enabled ? "NR On" : "NR"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setCreatineInput(creatineGoal);
                    setEditingCreatine(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {creatineNR.enabled && (
              <div className="px-3 pb-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!creatineNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "creatine"}
                  onClick={() => handleNRUpdate("creatine", true, false)}
                  className="h-6 text-xs"
                >
                  Soft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={creatineNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "creatine"}
                  onClick={() => handleNRUpdate("creatine", true, true)}
                  className="h-6 text-xs"
                >
                  Hard
                </Button>
                <span className="text-xs text-muted-foreground">
                  {creatineNR.isHard ? "1 completion = $5 forgiven" : "2 completions = $5 forgiven"}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Tablet className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Magnesium</p>
                  <Badge variant="secondary" className="text-xs">
                    Checkbox
                  </Badge>
                </div>
              </div>
              <Button
                variant={magnesiumNR.enabled ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                disabled={savingNR === "magnesium"}
                onClick={() => handleNRUpdate("magnesium", !magnesiumNR.enabled, magnesiumNR.isHard)}
              >
                {magnesiumNR.enabled ? "NR On" : "NR"}
              </Button>
            </div>
            {magnesiumNR.enabled && (
              <div className="px-3 pb-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!magnesiumNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "magnesium"}
                  onClick={() => handleNRUpdate("magnesium", true, false)}
                  className="h-6 text-xs"
                >
                  Soft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={magnesiumNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "magnesium"}
                  onClick={() => handleNRUpdate("magnesium", true, true)}
                  className="h-6 text-xs"
                >
                  Hard
                </Button>
                <span className="text-xs text-muted-foreground">
                  {magnesiumNR.isHard ? "1 completion = $5 forgiven" : "2 completions = $5 forgiven"}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Gym</p>
                  <Badge variant="secondary" className="text-xs">
                    {gymGoal} days/week
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={gymNR.enabled ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingNR === "gym"}
                  onClick={() => handleNRUpdate("gym", !gymNR.enabled, gymNR.isHard)}
                >
                  {gymNR.enabled ? "NR On" : "NR"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setGymInput(gymGoal);
                    setEditingGym(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {gymNR.enabled && (
              <div className="px-3 pb-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!gymNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "gym"}
                  onClick={() => handleNRUpdate("gym", true, false)}
                  className="h-6 text-xs"
                >
                  Soft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={gymNR.isHard ? "default" : "outline"}
                  disabled={savingNR === "gym"}
                  onClick={() => handleNRUpdate("gym", true, true)}
                  className="h-6 text-xs"
                >
                  Hard
                </Button>
                <span className="text-xs text-muted-foreground">
                  {gymNR.isHard ? "1 completion = $5 forgiven" : "2 completions = $5 forgiven"}
                </span>
              </div>
            )}
          </div>
        </div>

        <Dialog open={editingCreatine} onOpenChange={setEditingCreatine}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Creatine</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="creatine-goal">Servings / Day</Label>
                <Input
                  id="creatine-goal"
                  type="number"
                  min={1}
                  max={10}
                  value={creatineInput}
                  onChange={(e) =>
                    setCreatineInput(parseInt(e.target.value) || 1)
                  }
                />
              </div>
              <Button className="w-full" disabled={saving} onClick={saveCreatine}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editingGym} onOpenChange={setEditingGym}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Gym</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="gym-goal">Days / Week</Label>
                <Input
                  id="gym-goal"
                  type="number"
                  min={1}
                  max={7}
                  value={gymInput}
                  onChange={(e) => setGymInput(parseInt(e.target.value) || 1)}
                />
              </div>
              <Button className="w-full" disabled={saving} onClick={saveGym}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
