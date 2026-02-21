"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { updateLearningPreferences } from "@/lib/actions/learning";
import { generateFlashcardsFromBriefing } from "@/lib/actions/flashcards";
import type { LearningPreferences, NewsTopic } from "@/types/learning";

const ALL_TOPICS: { value: NewsTopic; label: string }[] = [
  { value: "tech", label: "Technology" },
  { value: "finance", label: "Finance" },
  { value: "general", label: "General News" },
  { value: "science", label: "Science" },
  { value: "health", label: "Health" },
];

interface LearningPreferencesDialogProps {
  preferences: LearningPreferences;
}

export function LearningPreferencesDialog({ preferences }: LearningPreferencesDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateLearningPreferences(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Preferences saved");
        setOpen(false);
      }
    });
  }

  function handleGenerateCards() {
    const today = new Date().toISOString().split("T")[0];
    startGenerating(async () => {
      const result = await generateFlashcardsFromBriefing(today);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Generated ${(result as { count?: number }).count ?? "some"} flashcards`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Learning settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Learning Preferences</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">News Topics</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_TOPICS.map((topic) => (
                <div key={topic.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`topic_${topic.value}`}
                    name={`topic_${topic.value}`}
                    defaultChecked={preferences.news_topics.includes(topic.value)}
                  />
                  <Label htmlFor={`topic_${topic.value}`} className="text-sm font-normal cursor-pointer">
                    {topic.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Sections</p>
            <div className="flex items-center justify-between">
              <Label htmlFor="news_enabled" className="text-sm font-normal">News Briefing</Label>
              <Switch id="news_enabled" name="news_enabled" defaultChecked={preferences.news_enabled} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ai_summary_enabled" className="text-sm font-normal">AI Summary</Label>
              <Switch id="ai_summary_enabled" name="ai_summary_enabled" defaultChecked={preferences.ai_summary_enabled} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="flashcard_enabled" className="text-sm font-normal">Flashcards</Label>
              <Switch id="flashcard_enabled" name="flashcard_enabled" defaultChecked={preferences.flashcard_enabled} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Flashcard Generation</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleGenerateCards}
              disabled={isGenerating}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              {isGenerating ? "Generating…" : "Generate Flashcards from Today's Briefing"}
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
