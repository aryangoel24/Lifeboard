export type NewsTopic = 'tech' | 'finance' | 'general' | 'science' | 'health';

export type LearningPreferences = {
  id: string;
  user_id: string;
  news_topics: NewsTopic[];
  flashcard_enabled: boolean;
  news_enabled: boolean;
  ai_summary_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type DailyContent = {
  id: string;
  user_id: string;
  content_date: string;
  content_type: 'news_briefing' | 'ai_summary';
  content: NewsBriefingContent | AISummaryContent;
  created_at: string;
};

export type FlashcardDeck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source: 'user' | 'ai_generated';
  created_at: string;
};

export type Flashcard = {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string;
  last_reviewed_at: string | null;
  created_at: string;
};

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type NewsHeadline = {
  title: string;
  description: string;
  url?: string;
};

export type TopicBriefing = {
  topic: NewsTopic;
  headlines: NewsHeadline[];
  summary: string;
  analysis?: string;
  continuing?: string;
};

export type NewsBriefingContent = {
  briefings: TopicBriefing[];
  generated_at: string;
};

export type AISummaryContent = {
  summary: string;
  fun_fact: string;
  learning_tip: string;
  generated_at: string;
};
