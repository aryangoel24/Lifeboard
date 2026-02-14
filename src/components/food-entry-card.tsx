"use client";

import { useState } from "react";
import Image from "next/image";
import { deleteFoodEntry } from "@/lib/actions/food-entries";
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
import { Pencil, Trash2 } from "lucide-react";
import type { FoodEntry, MealCategory } from "@/types/database";

const MEAL_BADGE_COLORS: Record<MealCategory, string> = {
  breakfast: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  lunch: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  dinner: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  snack: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
};

interface FoodEntryCardProps {
  entry: FoodEntry;
  userId: string;
  date: string;
}

export function FoodEntryCard({ entry, userId, date }: FoodEntryCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{entry.name}</CardTitle>
            <Badge
              variant="outline"
              className={MEAL_BADGE_COLORS[entry.meal_category]}
            >
              {entry.meal_category}
            </Badge>
          </div>
          <div className="flex gap-1">
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
      <CardContent className="space-y-2">
        {entry.photo_url && (
          <div className="relative w-full aspect-video rounded-md overflow-hidden">
            <Image
              src={entry.photo_url}
              alt={entry.name}
              fill
              className="object-cover"
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
      </CardContent>
    </Card>
  );
}
