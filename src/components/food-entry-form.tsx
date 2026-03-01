"use client";

import { useState } from "react";
import { createFoodEntry, updateFoodEntry } from "@/lib/actions/food-entries";
import { estimateNutrition } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoUpload } from "@/components/photo-upload";
import { toast } from "sonner";
import { getDefaultMealCategory, clientNowHour } from "@/lib/utils";
import { Sparkles, Loader2 } from "lucide-react";
import type { FoodEntry, MealCategory, MealSource } from "@/types/database";

interface FoodEntryFormProps {
  userId: string;
  date: string;
  entry?: FoodEntry;
  onSuccess?: () => void;
}

export function FoodEntryForm({
  userId,
  date,
  entry,
  onSuccess,
}: FoodEntryFormProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    entry?.photo_url ?? null
  );
  const [mealCategory, setMealCategory] = useState<MealCategory>(
    entry?.meal_category ?? getDefaultMealCategory(clientNowHour())
  );
  const [mealSource, setMealSource] = useState<MealSource | "">(
    entry?.meal_source ?? ""
  );
  const [loading, setLoading] = useState(false);

  // Controlled macro state for AI pre-fill
  const [name, setName] = useState(entry?.name ?? "");
  const [calories, setCalories] = useState(entry?.calories?.toString() ?? "");
  const [protein, setProtein] = useState(entry?.protein?.toString() ?? "");
  const [carbs, setCarbs] = useState(entry?.carbs?.toString() ?? "");
  const [fat, setFat] = useState(entry?.fat?.toString() ?? "");
  const [cost, setCost] = useState(entry?.cost?.toString() ?? "");

  // AI state
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrefilled, setAiPrefilled] = useState(false);

  async function handleAiEstimate() {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiPrefilled(false);

    const result = await estimateNutrition(aiInput);

    if (result.error) {
      toast.error(result.error);
    } else if (result.data) {
      setName(result.data.name);
      setCalories(result.data.calories.toString());
      setProtein(result.data.protein.toString());
      setCarbs(result.data.carbs.toString());
      setFat(result.data.fat.toString());
      setMealCategory(result.data.meal_category);
      setAiPrefilled(true);
      toast.success("Nutrition estimated! Review and adjust if needed.");
    }

    setAiLoading(false);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set("name", name);
    formData.set("calories", calories);
    formData.set("protein", protein);
    formData.set("carbs", carbs);
    formData.set("fat", fat);
    formData.set("photo_url", photoUrl ?? "");
    formData.set("meal_category", mealCategory);
    formData.set("meal_source", mealSource);
    formData.set("cost", cost);
    formData.set("logged_at", new Date(date + "T12:00:00").toISOString());

    const result = entry
      ? await updateFoodEntry(entry.id, formData)
      : await createFoodEntry(formData);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(entry ? "Entry updated" : "Entry added");
      onSuccess?.();
    }
    setLoading(false);
  }

  const aiHighlight = aiPrefilled
    ? "ring-2 ring-emerald-500/30 bg-emerald-500/5"
    : "";

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* AI Quick Entry */}
      {!entry && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            AI Quick Entry
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder='e.g. "grilled chicken with rice and broccoli"'
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAiEstimate();
                }
              }}
              disabled={aiLoading}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAiEstimate}
              disabled={aiLoading || !aiInput.trim()}
              className="shrink-0"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Describe what you ate and AI will estimate the nutrition
          </p>
        </div>
      )}

      {/* Divider when AI section is shown */}
      {!entry && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {aiPrefilled ? "Review & adjust" : "Or enter manually"}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Food name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Grilled chicken salad"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setAiPrefilled(false);
          }}
          required
          className={aiPrefilled ? aiHighlight : ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Meal</Label>
        <Select
          value={mealCategory}
          onValueChange={(v) => setMealCategory(v as MealCategory)}
        >
          <SelectTrigger className={aiPrefilled ? aiHighlight : ""}>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="calories">Calories</Label>
          <Input
            id="calories"
            name="calories"
            type="number"
            min={0}
            value={calories}
            onChange={(e) => {
              setCalories(e.target.value);
              setAiPrefilled(false);
            }}
            placeholder="0"
            className={aiPrefilled ? aiHighlight : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="protein">Protein (g)</Label>
          <Input
            id="protein"
            name="protein"
            type="number"
            min={0}
            step={0.1}
            value={protein}
            onChange={(e) => {
              setProtein(e.target.value);
              setAiPrefilled(false);
            }}
            placeholder="0"
            className={aiPrefilled ? aiHighlight : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="carbs">Carbs (g)</Label>
          <Input
            id="carbs"
            name="carbs"
            type="number"
            min={0}
            step={0.1}
            value={carbs}
            onChange={(e) => {
              setCarbs(e.target.value);
              setAiPrefilled(false);
            }}
            placeholder="0"
            className={aiPrefilled ? aiHighlight : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fat">Fat (g)</Label>
          <Input
            id="fat"
            name="fat"
            type="number"
            min={0}
            step={0.1}
            value={fat}
            onChange={(e) => {
              setFat(e.target.value);
              setAiPrefilled(false);
            }}
            placeholder="0"
            className={aiPrefilled ? aiHighlight : ""}
          />
        </div>
      </div>

      {/* Budget & Cooking Tracking */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cost">Cost ($)</Label>
          <Input
            id="cost"
            name="cost"
            type="number"
            min={0}
            step={0.01}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>Source</Label>
          <Select
            value={mealSource}
            onValueChange={(v) => setMealSource(v as MealSource)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="homemade">Homemade</SelectItem>
              <SelectItem value="restaurant">Restaurant</SelectItem>
              <SelectItem value="takeout">Takeout</SelectItem>
              <SelectItem value="grocery_prepared">Grocery (prepared)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <PhotoUpload
        userId={userId}
        currentUrl={entry?.photo_url}
        onUpload={setPhotoUrl}
      />

      <Button type="submit" className="w-full" disabled={loading}>
        {loading
          ? entry
            ? "Updating..."
            : "Adding..."
          : entry
            ? "Update entry"
            : "Add entry"}
      </Button>
    </form>
  );
}
