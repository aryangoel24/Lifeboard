"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FoodEntryForm } from "@/components/food-entry-form";
import { logMultipleFromPantry } from "@/lib/actions/pantry";
import { scaleNutrition } from "@/lib/pantry-utils";
import { Plus, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn, getDefaultMealCategory, clientNowHour } from "@/lib/utils";
import type { PantryItem, MealCategory } from "@/types/database";

interface AddEntryDialogProps {
  userId: string;
  date: string;
  pantryItems?: PantryItem[];
}

type PantryRow = {
  id: string;
  pantryItemId: string;
  amount: string;
  open: boolean;
};

function PantryTab({
  pantryItems,
  date,
  onSuccess,
}: {
  pantryItems: PantryItem[];
  date: string;
  onSuccess: () => void;
}) {
  const [rows, setRows] = useState<PantryRow[]>([
    { id: crypto.randomUUID(), pantryItemId: "", amount: "", open: false },
  ]);
  const [mealCategory, setMealCategory] = useState<MealCategory>(
    getDefaultMealCategory(clientNowHour())
  );
  const [loading, setLoading] = useState(false);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), pantryItemId: "", amount: "", open: false },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function setRowField(id: string, field: keyof PantryRow, value: string | boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  const preview = useMemo(() => {
    let cal = 0, pro = 0, carbs = 0, fat = 0;
    for (const row of rows) {
      const item = pantryItems.find((p) => p.id === row.pantryItemId);
      const amt = parseFloat(row.amount);
      if (!item || !(amt > 0)) continue;
      const scaled = scaleNutrition(item, amt);
      cal += scaled.calories;
      pro += scaled.protein;
      carbs += scaled.carbs;
      fat += scaled.fat;
    }
    return { cal, pro, carbs, fat };
  }, [rows, pantryItems]);

  const validRows = rows.filter(
    (r) => r.pantryItemId && parseFloat(r.amount) > 0
  );

  async function handleLog() {
    if (validRows.length === 0) {
      toast.error("Select at least one item with a quantity");
      return;
    }
    setLoading(true);
    const result = await logMultipleFromPantry(
      validRows.map((r) => ({ pantryItemId: r.pantryItemId, amount: parseFloat(r.amount) })),
      mealCategory,
      date,
    );
    setLoading(false);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`Logged ${validRows.length} item${validRows.length > 1 ? "s" : ""}`);
      onSuccess();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((row, i) => {
          const selectedItem = pantryItems.find((p) => p.id === row.pantryItemId);
          return (
            <div key={row.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <Popover
                  open={row.open}
                  onOpenChange={(open) => setRowField(row.id, "open", open)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {selectedItem ? selectedItem.name : "Search pantry…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search pantry…" />
                      <CommandList>
                        <CommandEmpty>No items found.</CommandEmpty>
                        <CommandGroup>
                          {pantryItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={item.name}
                              onSelect={() => {
                                setRowField(row.id, "pantryItemId", item.id);
                                setRowField(row.id, "open", false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  row.pantryItemId === item.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.calories_per_base} cal / {item.base_amount}{item.base_unit}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Qty"
                  value={row.amount}
                  onChange={(e) => setRowField(row.id, "amount", e.target.value)}
                  className="w-20"
                />
                {selectedItem && (
                  <span className="text-xs text-muted-foreground w-8 shrink-0">
                    {selectedItem.base_unit}
                  </span>
                )}
              </div>

              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addRow}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add another item
      </Button>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Meal</label>
        <Select
          value={mealCategory}
          onValueChange={(v) => setMealCategory(v as MealCategory)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="breakfast">Breakfast</SelectItem>
            <SelectItem value="lunch">Lunch</SelectItem>
            <SelectItem value="dinner">Dinner</SelectItem>
            <SelectItem value="snack">Snack</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preview.cal > 0 && (
        <div className="text-sm text-muted-foreground bg-muted rounded px-3 py-2">
          Total: <span className="font-medium text-foreground">{Math.round(preview.cal)} cal</span>
          {" · "}{Math.round(preview.pro * 10) / 10}g P
          {" · "}{Math.round(preview.carbs * 10) / 10}g C
          {" · "}{Math.round(preview.fat * 10) / 10}g F
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleLog}
        disabled={loading || validRows.length === 0}
      >
        {loading
          ? "Logging…"
          : validRows.length > 0
            ? `Log ${validRows.length} item${validRows.length > 1 ? "s" : ""}`
            : "Log items"}
      </Button>
    </div>
  );
}

export function AddEntryDialog({ userId, date, pantryItems = [] }: AddEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"manual" | "pantry">("manual");

  const hasPantry = pantryItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add food entry</DialogTitle>
        </DialogHeader>

        {hasPantry && (
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={cn(
                "flex-1 py-1.5 text-sm transition-colors",
                tab === "manual" ? "bg-foreground text-background" : "hover:bg-muted"
              )}
              onClick={() => setTab("manual")}
            >
              Manual
            </button>
            <button
              className={cn(
                "flex-1 py-1.5 text-sm transition-colors",
                tab === "pantry" ? "bg-foreground text-background" : "hover:bg-muted"
              )}
              onClick={() => setTab("pantry")}
            >
              Pantry
            </button>
          </div>
        )}

        {tab === "manual" || !hasPantry ? (
          <FoodEntryForm
            userId={userId}
            date={date}
            onSuccess={() => setOpen(false)}
          />
        ) : (
          <PantryTab
            pantryItems={pantryItems}
            date={date}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
