"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FoodEntryForm } from "@/components/food-entry-form";
import { Plus } from "lucide-react";

interface AddEntryDialogProps {
  userId: string;
  date: string;
}

export function AddEntryDialog({ userId, date }: AddEntryDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add food entry</DialogTitle>
        </DialogHeader>
        <FoodEntryForm
          userId={userId}
          date={date}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
