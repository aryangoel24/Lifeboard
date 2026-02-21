import type { NewsTopic, NewsHeadline, ReviewQuality } from "@/types/learning";

export const RSS_FEEDS: Record<NewsTopic, string> = {
  tech: "https://hnrss.org/frontpage",
  finance: "https://finance.yahoo.com/news/rssindex",
  general: "https://feeds.bbci.co.uk/news/rss.xml",
  science: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
  health: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
};

export function parseRSSFeed(xml: string): NewsHeadline[] {
  const items: NewsHeadline[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < 5) {
    const itemContent = itemMatch[1];

    const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = itemContent.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 200)
      : "";

    const linkTextMatch = itemContent.match(/<link[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^\s<]+)(?:\]\]>)?<\/link>/i);
    const linkAttrMatch = itemContent.match(/<link[^>]*\shref=["'](https?:\/\/[^"']+)["']/i);
    const url = (linkTextMatch?.[1] || linkAttrMatch?.[1] || "").trim() || undefined;

    if (title) {
      items.push({ title, description, url });
    }
  }

  return items;
}

export function calculateNextReview(
  quality: ReviewQuality,
  easeFactor: number,
  intervalDays: number,
  repetitions: number
): { nextInterval: number; nextEaseFactor: number; nextRepetitions: number } {
  // SM-2 algorithm
  let nextEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (nextEaseFactor < 1.3) nextEaseFactor = 1.3;

  let nextRepetitions = repetitions;
  let nextInterval: number;

  if (quality < 3) {
    // Failed — reset
    nextRepetitions = 0;
    nextInterval = 1;
  } else {
    nextRepetitions = repetitions + 1;
    if (repetitions === 0) {
      nextInterval = 1;
    } else if (repetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(intervalDays * easeFactor);
    }
  }

  return { nextInterval, nextEaseFactor, nextRepetitions };
}
