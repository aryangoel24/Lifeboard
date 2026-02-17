"use client";

import { useState } from "react";
import Image from "next/image";
import { deleteFoodEntry } from "@/lib/actions/food-entries";
import { createMealTemplate } from "@/lib/actions/meal-templates";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FoodEntryForm } from "@/components/food-entry-form";
import { toast } from "sonner";
import { Pencil, Trash2, ChevronDown, ChevronUp, Bookmark, Clock } from "lucide-react";
import type { FoodEntry, MealCategory } from "@/types/database";
import { format } from "date-fns";

const MEAL_BADGE_COLORS: Record<MealCategory, string> = {
  breakfast: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  lunch: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  dinner: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  snack: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  homemade: "\ud83c\udfe0 Homemade",
  restaurant: "\ud83c\udf7d\ufe0f Restaurant",
  takeout: "\ud83e\udd61 Takeout",
  grocery_prepared: "\ud83d\uded2 Grocery",
};

const SOURCE_ICONS: Record<string, string> = {
  homemade: "\ud83c\udfe0",
  restaurant: "\ud83c\udf7d\ufe0f",
  takeout: "\ud83e\udd61",
  grocery_prepared: "\ud83d\uded2",
};

interface FoodEntryCardProps {
  entry: FoodEntry;
  userId: string;
  date: string;
}

export function FoodEntryCard({ entry, userId, date }: FoodEntryCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this entry?")) return;
    setDeleting(true);
    const result = await deleteFoodEntry(entry.id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Entry deleted");
    }
    setDeleting(false);
  }

  async function handleSaveAsTemplate() {
    const formData = new FormData();
    formData.set("name", entry.name);
    formData.set("calories", String(entry.calories));
    formData.set("protein", String(entry.protein));
    formData.set("carbs", String(entry.carbs));
    formData.set("fat", String(entry.fat));
    formData.set("meal_category", entry.meal_category);

    const result = await createMealTemplate(formData);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Saved as template!");
    }
  }

  const logTime = format(new Date(entry.logged_at), "h:mm a");

  return (
    <Card className="glass-card rounded-2xl hover:shadow-xl transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div
            className="flex-1 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{entry.name}</CardTitle>
              <Badge
                variant="outline"
                className={MEAL_BADGE_COLORS[entry.meal_category]}
              >
                {entry.meal_category}
              </Badge>
            </div>
            {/* Collapsed macro summary */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              {entry.meal_source && <span>{SOURCE_ICONS[entry.meal_source]}</span>}
              <span>{entry.calories} cal</span>
              <span>{Math.round(entry.protein)}g P</span>
              <span>{Math.round(entry.carbs)}g C</span>
              <span>{Math.round(entry.fat)}g F</span>
              {entry.cost && <span>{"\u2022"} ${Number(entry.cost).toFixed(2)}</span>}
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSaveAsTemplate}
              title="Save as template"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit entry</DialogTitle>
                </DialogHeader>
                <FoodEntryForm
                  userId={userId}
                  date={date}
                  entry={entry}
                  onSuccess={() => setEditOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Expanded details */}
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {entry.photo_url && (
            <div className="relative w-full aspect-video rounded-md overflow-hidden">
              <Image
                src={entry.photo_url}
                alt={entry.name}
                fill
                className="object-cover"
                sizes="(max-width: 672px) 100vw, 672px"
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Calories</p>
              <p className="font-medium">{entry.calories}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Protein</p>
              <p className="font-medium">{entry.protein}g</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Carbs</p>
              <p className="font-medium">{entry.carbs}g</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Fat</p>
              <p className="font-medium">{entry.fat}g</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {logTime}
            </span>
            {entry.meal_source && (
              <span>{SOURCE_LABELS[entry.meal_source] || entry.meal_source}</span>
            )}
            {entry.cost && (
              <span className="font-medium text-foreground">
                ${Number(entry.cost).toFixed(2)}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
