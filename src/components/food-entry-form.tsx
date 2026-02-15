"use client";

import { useState } from "react";
import { createFoodEntry, updateFoodEntry } from "@/lib/actions/food-entries";
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
import { getDefaultMealCategory } from "@/lib/utils";
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
    entry?.meal_category ?? getDefaultMealCategory()
  );
  const [mealSource, setMealSource] = useState<MealSource | "">(
    entry?.meal_source ?? ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set("photo_url", photoUrl ?? "");
    formData.set("meal_category", mealCategory);
    formData.set("meal_source", mealSource);
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

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Food name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Grilled chicken salad"
          defaultValue={entry?.name}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Meal</Label>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="calories">Calories</Label>
          <Input
            id="calories"
            name="calories"
            type="number"
            min={0}
            defaultValue={entry?.calories ?? ""}
            placeholder="0"
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
            defaultValue={entry?.protein ?? ""}
            placeholder="0"
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
            defaultValue={entry?.carbs ?? ""}
            placeholder="0"
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
            defaultValue={entry?.fat ?? ""}
            placeholder="0"
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
            defaultValue={entry?.cost ?? ""}
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
