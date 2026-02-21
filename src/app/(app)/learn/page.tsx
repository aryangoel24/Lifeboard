import {
  getLearningPreferences,
  getDailyContent,
  generateNewsBriefing,
  generateAISummary,
} from "@/lib/actions/learning";
import { getDueFlashcards, getFlashcardStats } from "@/lib/actions/flashcards";
import { LearnClient } from "@/components/learn-client";

export default async function LearnPage() {
  const today = new Date().toISOString().split("T")[0];

  const preferences = await getLearningPreferences();

  if (!preferences) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground">
        <p>Please log in to access the Learning Hub.</p>
      </div>
    );
  }

  // Fetch cached content + stats in parallel
  const [cachedNews, cachedSummary, dueCards, stats] = await Promise.all([
    preferences.news_enabled ? getDailyContent(today, "news_briefing") : Promise.resolve(null),
    preferences.ai_summary_enabled ? getDailyContent(today, "ai_summary") : Promise.resolve(null),
    preferences.flashcard_enabled ? getDueFlashcards(5) : Promise.resolve([]),
    getFlashcardStats(),
  ]);

  // Generate content that doesn't exist yet (in parallel)
  const [newsBriefing, aiSummary] = await Promise.all([
    preferences.news_enabled && !cachedNews
      ? generateNewsBriefing(preferences.news_topics)
      : Promise.resolve(cachedNews),
    preferences.ai_summary_enabled && !cachedSummary
      ? generateAISummary(preferences.news_topics)
      : Promise.resolve(cachedSummary),
  ]);

  return (
    <LearnClient
      preferences={preferences}
      newsBriefing={newsBriefing}
      aiSummary={aiSummary}
      dueCards={dueCards}
      stats={stats}
    />
  );
}
