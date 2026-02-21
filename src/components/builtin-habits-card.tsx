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
import type { Profile } from "@/types/database";

export function BuiltinHabitsCard({ profile }: { profile: Profile }) {
  const [creatineGoal, setCreatineGoal] = useState(profile.creatine_goal);
  const [gymGoal, setGymGoal] = useState(profile.gym_weekly_goal);
  const [creatineInput, setCreatineInput] = useState(profile.creatine_goal);
  const [gymInput, setGymInput] = useState(profile.gym_weekly_goal);
  const [editingCreatine, setEditingCreatine] = useState(false);
  const [editingGym, setEditingGym] = useState(false);
  const [saving, setSaving] = useState(false);

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
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Pill className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Creatine</p>
                <Badge variant="secondary" className="text-xs">
                  {creatineGoal} servings/day
                </Badge>
              </div>
            </div>
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

          <div className="flex items-center p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Tablet className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Magnesium</p>
                <Badge variant="secondary" className="text-xs">
                  Checkbox
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Dumbbell className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Gym</p>
                <Badge variant="secondary" className="text-xs">
                  {gymGoal} days/week
                </Badge>
              </div>
            </div>
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
