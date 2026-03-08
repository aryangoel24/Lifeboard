"use client";

import { useState, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  createCustomHabit,
  updateCustomHabit,
  archiveCustomHabit,
  unarchiveCustomHabit,
} from "@/lib/actions/custom-habits";
import { updateCustomHabitNRSettings } from "@/lib/actions/habit-debt";
import { Plus, Pencil, Archive, ArchiveRestore, Eye, EyeOff, Sparkles, Loader2 } from "lucide-react";
import { generateHabitIcon } from "@/lib/actions/custom-habits";
import type { CustomHabit } from "@/types/database";

interface ManageHabitsProps {
  habits: CustomHabit[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TRACKING_TYPE_LABELS = {
  checkbox: "Checkbox",
  counter: "Counter",
  duration: "Duration (min)",
};

function HabitFormDialog({
  habit,
  open,
  onOpenChange,
}: {
  habit?: CustomHabit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [icon, setIcon] = useState<string>(habit?.icon || "✅");
  const [generatingIcon, setGeneratingIcon] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [frequency, setFrequency] = useState<string>(habit?.frequency || "daily");
  const [selectedDays, setSelectedDays] = useState<number[]>(
    habit?.frequency_days || []
  );
  const [trackingType, setTrackingType] = useState<string>(
    habit?.tracking_type || "checkbox"
  );
  const [nrEnabled, setNrEnabled] = useState<boolean>(habit?.nr_enabled ?? false);
  const [savingNr, setSavingNr] = useState(false);

  const isEdit = !!habit;

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    formData.set("frequency", frequency);
    formData.set("tracking_type", trackingType);
    if (frequency === "custom") {
      formData.set("frequency_days", selectedDays.join(","));
    }

    const result = isEdit
      ? await updateCustomHabit(habit.id, formData)
      : await createCustomHabit(formData);

    if (result.error) {
      toast.error(result.error);
    } else {
      // Save NR settings if editing existing habit
      if (isEdit) {
        await updateCustomHabitNRSettings(habit.id, nrEnabled);
      }
      toast.success(isEdit ? "Habit updated" : "Habit created");
      onOpenChange(false);
    }
    setSaving(false);
  }

  async function handleNrToggle(enabled: boolean) {
    if (!habit?.id) return;
    setSavingNr(true);
    const result = await updateCustomHabitNRSettings(habit.id, enabled);
    if (result.error) {
      toast.error(result.error);
    } else {
      setNrEnabled(enabled);
    }
    setSavingNr(false);
  }

  async function handleGenerateIcon() {
    const habitName = nameRef.current?.value?.trim();
    if (!habitName) {
      toast.error("Enter a habit name first");
      return;
    }
    setGeneratingIcon(true);
    const result = await generateHabitIcon(habitName);
    if (result.icon) {
      setIcon(result.icon);
    } else {
      toast.error("Could not generate icon");
    }
    setGeneratingIcon(false);
  }

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Habit" : "Add Habit"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              ref={nameRef}
              id="name"
              name="name"
              defaultValue={habit?.name}
              placeholder="e.g. Meditation"
              required
            />
          </div>
          <div>
            <Label htmlFor="icon">Icon</Label>
            <div className="flex gap-2">
              <Input
                id="icon"
                name="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🧘"
                maxLength={4}
                className="w-[68px]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerateIcon}
                disabled={generatingIcon}
                title="Suggest icon with AI"
              >
                {generatingIcon ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <Label>Tracking Type</Label>
            <Select value={trackingType} onValueChange={setTrackingType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checkbox">Checkbox (done/not done)</SelectItem>
                <SelectItem value="counter">Counter (e.g. 2/3 servings)</SelectItem>
                <SelectItem value="duration">Duration (minutes)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {trackingType !== "checkbox" && (
            <div>
              <Label htmlFor="target_value">
                Target {trackingType === "duration" ? "(minutes)" : "(count)"}
              </Label>
              <Input
                id="target_value"
                name="target_value"
                type="number"
                min={1}
                defaultValue={habit?.target_value ?? 1}
              />
            </div>
          )}

          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="weekdays">Weekdays only</SelectItem>
                <SelectItem value="custom">Custom days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "custom" && (
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, i) => (
                <Button
                  key={i}
                  type="button"
                  size="sm"
                  variant={selectedDays.includes(i) ? "default" : "outline"}
                  className="h-8 w-10 text-xs"
                  onClick={() => toggleDay(i)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}

          <div>
            <Label htmlFor="category">Category (optional)</Label>
            <Input
              id="category"
              name="category"
              defaultValue={habit?.category || ""}
              placeholder="e.g. Health, Mindfulness"
            />
          </div>

          {isEdit && (
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium">Accountability</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Negative Reinforcement</p>
                  <p className="text-xs text-muted-foreground">Charge penalty on missed days</p>
                </div>
                <Button
                  type="button"
                  variant={nrEnabled ? "default" : "outline"}
                  size="sm"
                  disabled={savingNr}
                  onClick={() => handleNrToggle(!nrEnabled)}
                >
                  {nrEnabled ? "On" : "Off"}
                </Button>
              </div>
              {nrEnabled && (
                <p className="text-xs text-muted-foreground">
                  $5 penalty per missed day. Resets into total owed every Monday.
                </p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update Habit" : "Create Habit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManageHabits({ habits }: ManageHabitsProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editHabit, setEditHabit] = useState<CustomHabit | null>(null);

  const activeHabits = habits.filter((h) => !h.archived);
  const archivedHabits = habits.filter((h) => h.archived);
  const displayedHabits = showArchived ? habits : activeHabits;

  async function handleArchive(id: string) {
    const result = await archiveCustomHabit(id);
    if (result.error) toast.error(result.error);
    else toast.success("Habit archived");
  }

  async function handleUnarchive(id: string) {
    const result = await unarchiveCustomHabit(id);
    if (result.error) toast.error(result.error);
    else toast.success("Habit restored");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Custom Habits</CardTitle>
          <div className="flex items-center gap-2">
            {archivedHabits.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? (
                  <EyeOff className="h-4 w-4 mr-1" />
                ) : (
                  <Eye className="h-4 w-4 mr-1" />
                )}
                {showArchived ? "Hide archived" : `${archivedHabits.length} archived`}
              </Button>
            )}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Habit
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayedHabits.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No custom habits yet. Add one to start tracking.
          </p>
        ) : (
          <div className="space-y-2">
            {displayedHabits.map((habit) => (
              <div
                key={habit.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  habit.archived ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{habit.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{habit.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {TRACKING_TYPE_LABELS[habit.tracking_type]}
                      </Badge>
                      {habit.target_value > 1 && (
                        <span className="text-xs text-muted-foreground">
                          Target: {habit.target_value}
                          {habit.tracking_type === "duration" ? " min" : ""}
                        </span>
                      )}
                      {habit.frequency !== "daily" && (
                        <span className="text-xs text-muted-foreground">
                          {habit.frequency === "weekdays"
                            ? "Weekdays"
                            : habit.frequency_days
                              ?.map((d) => DAY_LABELS[d])
                              .join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!habit.archived ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditHabit(habit)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleArchive(habit.id)}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleUnarchive(habit.id)}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <HabitFormDialog open={addOpen} onOpenChange={setAddOpen} />
        {editHabit && (
          <HabitFormDialog
            habit={editHabit}
            open={!!editHabit}
            onOpenChange={(open) => {
              if (!open) setEditHabit(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
