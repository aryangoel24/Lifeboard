"use client";

import { LearningPreferencesDialog } from "@/components/learning-preferences-dialog";
import { NewsBriefingCard } from "@/components/news-briefing-card";
import { AISummaryCard } from "@/components/ai-summary-card";
import { FlashcardWidget } from "@/components/flashcard-widget";
import type { LearningPreferences, DailyContent, Flashcard } from "@/types/learning";

interface LearnClientProps {
  preferences: LearningPreferences;
  newsBriefing: DailyContent | null;
  aiSummary: DailyContent | null;
  dueCards: Flashcard[];
  stats: { total: number; dueToday: number; mastered: number };
}

export function LearnClient({ preferences, newsBriefing, aiSummary, dueCards, stats }: LearnClientProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Learning Hub</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your daily briefing and review</p>
        </div>
        <LearningPreferencesDialog preferences={preferences} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {preferences.news_enabled && (
          <NewsBriefingCard
            initialContent={newsBriefing}
            topics={preferences.news_topics}
          />
        )}
        {preferences.ai_summary_enabled && (
          <AISummaryCard
            initialContent={aiSummary}
            topics={preferences.news_topics}
          />
        )}
      </div>

      {preferences.flashcard_enabled && (
        <FlashcardWidget initialCards={dueCards} stats={stats} />
      )}
    </div>
  );
}
