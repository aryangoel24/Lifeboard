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
import { Eye, EyeOff, Pencil, Pill, Tablet, Dumbbell } from "lucide-react";
import { updateBuiltinHabitGoal, updateBuiltinHabitLabel, toggleBuiltinHabitHidden } from "@/lib/actions/goals";
import { updateBuiltinHabitNRSettings } from "@/lib/actions/habit-debt";
import type { Profile } from "@/types/database";

type BuiltinType = "creatine" | "magnesium" | "gym";

export function BuiltinHabitsCard({ profile }: { profile: Profile }) {
  const [creatineGoal, setCreatineGoal] = useState(profile.creatine_goal);
  const [gymGoal, setGymGoal] = useState(profile.gym_weekly_goal);
  const [creatineInput, setCreatineInput] = useState(profile.creatine_goal);
  const [gymInput, setGymInput] = useState(profile.gym_weekly_goal);
  const [editingCreatine, setEditingCreatine] = useState(false);
  const [editingMagnesium, setEditingMagnesium] = useState(false);
  const [editingGym, setEditingGym] = useState(false);
  const [saving, setSaving] = useState(false);

  // Label state
  const [creatineLabel, setCreatineLabel] = useState(profile.creatine_label ?? "Creatine");
  const [magnesiumLabel, setMagnesiumLabel] = useState(profile.magnesium_label ?? "Magnesium");
  const [gymLabel, setGymLabel] = useState(profile.gym_label ?? "Gym");
  const [creatineLabelInput, setCreatineLabelInput] = useState(profile.creatine_label ?? "Creatine");
  const [magnesiumLabelInput, setMagnesiumLabelInput] = useState(profile.magnesium_label ?? "Magnesium");
  const [gymLabelInput, setGymLabelInput] = useState(profile.gym_label ?? "Gym");

  // Hidden state
  const [creatineHidden, setCreatineHidden] = useState(profile.creatine_hidden ?? false);
  const [magnesiumHidden, setMagnesiumHidden] = useState(profile.magnesium_hidden ?? false);
  const [gymHidden, setGymHidden] = useState(profile.gym_hidden ?? false);
  const [togglingHidden, setTogglingHidden] = useState<BuiltinType | null>(null);

  // NR state
  const [creatineNR, setCreatineNR] = useState(profile.creatine_nr_enabled ?? false);
  const [magnesiumNR, setMagnesiumNR] = useState(profile.magnesium_nr_enabled ?? false);
  const [gymNR, setGymNR] = useState(profile.gym_nr_enabled ?? false);
  const [savingNR, setSavingNR] = useState<string | null>(null);

  async function handleNRUpdate(type: BuiltinType, enabled: boolean) {
    setSavingNR(type);
    const result = await updateBuiltinHabitNRSettings(type, enabled);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (type === "creatine") setCreatineNR(enabled);
      if (type === "magnesium") setMagnesiumNR(enabled);
      if (type === "gym") setGymNR(enabled);
    }
    setSavingNR(null);
  }

  async function handleToggleHidden(type: BuiltinType, hidden: boolean) {
    setTogglingHidden(type);
    const result = await toggleBuiltinHabitHidden(type, hidden);
    if (result.error) {
      toast.error(result.error);
    } else {
      if (type === "creatine") setCreatineHidden(hidden);
      if (type === "magnesium") setMagnesiumHidden(hidden);
      if (type === "gym") setGymHidden(hidden);
    }
    setTogglingHidden(null);
  }

  async function saveCreatine() {
    setSaving(true);
    const [goalResult, labelResult] = await Promise.all([
      updateBuiltinHabitGoal("creatine_goal", creatineInput),
      updateBuiltinHabitLabel("creatine", creatineLabelInput),
    ]);
    if (goalResult.error) {
      toast.error(goalResult.error);
    } else if (labelResult.error) {
      toast.error(labelResult.error);
    } else {
      setCreatineGoal(creatineInput);
      setCreatineLabel(creatineLabelInput);
      setEditingCreatine(false);
      toast.success("Creatine updated");
    }
    setSaving(false);
  }

  async function saveMagnesium() {
    setSaving(true);
    const result = await updateBuiltinHabitLabel("magnesium", magnesiumLabelInput);
    if (result.error) {
      toast.error(result.error);
    } else {
      setMagnesiumLabel(magnesiumLabelInput);
      setEditingMagnesium(false);
      toast.success("Magnesium updated");
    }
    setSaving(false);
  }

  async function saveGym() {
    setSaving(true);
    const [goalResult, labelResult] = await Promise.all([
      updateBuiltinHabitGoal("gym_weekly_goal", gymInput),
      updateBuiltinHabitLabel("gym", gymLabelInput),
    ]);
    if (goalResult.error) {
      toast.error(goalResult.error);
    } else if (labelResult.error) {
      toast.error(labelResult.error);
    } else {
      setGymGoal(gymInput);
      setGymLabel(gymLabelInput);
      setEditingGym(false);
      toast.success("Gym updated");
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
          {/* Creatine */}
          <div className={`rounded-lg border ${creatineHidden ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Pill className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">{creatineLabel}</p>
                  <Badge variant="secondary" className="text-xs">
                    {creatineGoal} servings/day
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={creatineNR ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingNR === "creatine" || creatineHidden}
                  onClick={() => handleNRUpdate("creatine", !creatineNR)}
                >
                  {creatineNR ? "NR On" : "NR"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={togglingHidden === "creatine"}
                  onClick={() => handleToggleHidden("creatine", !creatineHidden)}
                  title={creatineHidden ? "Show on dashboard" : "Hide from dashboard"}
                >
                  {creatineHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setCreatineInput(creatineGoal);
                    setCreatineLabelInput(creatineLabel);
                    setEditingCreatine(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Magnesium */}
          <div className={`rounded-lg border ${magnesiumHidden ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Tablet className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">{magnesiumLabel}</p>
                  <Badge variant="secondary" className="text-xs">
                    Checkbox
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={magnesiumNR ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingNR === "magnesium" || magnesiumHidden}
                  onClick={() => handleNRUpdate("magnesium", !magnesiumNR)}
                >
                  {magnesiumNR ? "NR On" : "NR"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={togglingHidden === "magnesium"}
                  onClick={() => handleToggleHidden("magnesium", !magnesiumHidden)}
                  title={magnesiumHidden ? "Show on dashboard" : "Hide from dashboard"}
                >
                  {magnesiumHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setMagnesiumLabelInput(magnesiumLabel);
                    setEditingMagnesium(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Gym */}
          <div className={`rounded-lg border ${gymHidden ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">{gymLabel}</p>
                  <Badge variant="secondary" className="text-xs">
                    {gymGoal} days/week
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={gymNR ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={savingNR === "gym" || gymHidden}
                  onClick={() => handleNRUpdate("gym", !gymNR)}
                >
                  {gymNR ? "NR On" : "NR"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={togglingHidden === "gym"}
                  onClick={() => handleToggleHidden("gym", !gymHidden)}
                  title={gymHidden ? "Show on dashboard" : "Hide from dashboard"}
                >
                  {gymHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setGymInput(gymGoal);
                    setGymLabelInput(gymLabel);
                    setEditingGym(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Creatine Dialog */}
        <Dialog open={editingCreatine} onOpenChange={setEditingCreatine}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Creatine</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="creatine-name">Name</Label>
                <Input
                  id="creatine-name"
                  value={creatineLabelInput}
                  onChange={(e) => setCreatineLabelInput(e.target.value)}
                  placeholder="Creatine"
                />
              </div>
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

        {/* Magnesium Dialog */}
        <Dialog open={editingMagnesium} onOpenChange={setEditingMagnesium}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Magnesium</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="magnesium-name">Name</Label>
                <Input
                  id="magnesium-name"
                  value={magnesiumLabelInput}
                  onChange={(e) => setMagnesiumLabelInput(e.target.value)}
                  placeholder="Magnesium"
                />
              </div>
              <Button className="w-full" disabled={saving} onClick={saveMagnesium}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Gym Dialog */}
        <Dialog open={editingGym} onOpenChange={setEditingGym}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Gym</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="gym-name">Name</Label>
                <Input
                  id="gym-name"
                  value={gymLabelInput}
                  onChange={(e) => setGymLabelInput(e.target.value)}
                  placeholder="Gym"
                />
              </div>
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
