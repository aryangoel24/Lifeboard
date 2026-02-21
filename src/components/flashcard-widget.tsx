"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reviewFlashcard } from "@/lib/actions/flashcards";
import type { Flashcard, ReviewQuality } from "@/types/learning";

interface FlashcardWidgetProps {
  initialCards: Flashcard[];
  stats: { total: number; dueToday: number; mastered: number };
}

export function FlashcardWidget({ initialCards, stats }: FlashcardWidgetProps) {
  const router = useRouter();
  const [cards] = useState<Flashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(initialCards.length === 0);

  // Reset when new cards are loaded (e.g. after generation)
  useEffect(() => {
    setDone(initialCards.length === 0);
    setCurrentIndex(0);
    setFlipped(false);
  }, [initialCards.length]);

  const current = cards[currentIndex];

  function handleFlip() {
    setFlipped((f) => !f);
  }

  function handleRate(quality: ReviewQuality) {
    if (!current) return;
    startTransition(async () => {
      await reviewFlashcard(current.id, quality);
      const next = currentIndex + 1;
      if (next >= cards.length) {
        setDone(true);
        toast.success("All cards reviewed!");
        router.refresh();
      } else {
        setCurrentIndex(next);
        setFlipped(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="h-4 w-4 text-emerald-500" />
          Flashcards
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {stats.dueToday > 0 && (
            <Badge variant="secondary" className="text-xs">
              {stats.dueToday} due
            </Badge>
          )}
          {stats.mastered > 0 && (
            <Badge variant="outline" className="text-xs text-emerald-600">
              {stats.mastered} mastered
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {stats.total === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BrainCircuit className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No flashcards yet.</p>
            <p className="text-xs mt-1">Generate cards from the news briefing via settings.</p>
          </div>
        ) : done ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            <p className="text-sm font-medium">All done for today!</p>
            <p className="text-xs mt-1">{stats.total} total · {stats.mastered} mastered</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground text-right">
              {currentIndex + 1} / {cards.length}
            </div>

            {/* Card face */}
            <button
              onClick={handleFlip}
              className="w-full min-h-[120px] rounded-lg border border-border shadow-sm p-4 text-center cursor-pointer select-none hover:bg-muted/30 transition-colors flex items-center justify-center"
            >
              <div>
                <p className="text-xs text-muted-foreground mb-1">{flipped ? "Answer" : "Question"}</p>
                <p className="text-sm font-medium leading-relaxed">
                  {flipped ? current.back : current.front}
                </p>
                {!flipped && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
                    <span className="bg-muted/50 rounded-full px-2 py-0.5 flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" /> tap to reveal
                    </span>
                  </p>
                )}
              </div>
            </button>

            {/* Rating buttons — only visible after flip */}
            {flipped && (
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                  onClick={() => handleRate(1)}
                  disabled={isPending}
                >
                  Again
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-yellow-200 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-800 dark:text-yellow-400"
                  onClick={() => handleRate(3)}
                  disabled={isPending}
                >
                  Good
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                  onClick={() => handleRate(5)}
                  disabled={isPending}
                >
                  Easy
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
