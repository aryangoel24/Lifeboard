"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { RSS_FEEDS, parseRSSFeed } from "@/lib/learning-utils";
import type {
  LearningPreferences,
  DailyContent,
  NewsTopic,
  NewsBriefingContent,
  AISummaryContent,
  TopicBriefing,
} from "@/types/learning";
import OpenAI from "openai";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function getLearningPreferences(): Promise<LearningPreferences | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("learning_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (data) return data as LearningPreferences;

  // Upsert defaults
  const { data: created } = await supabase
    .from("learning_preferences")
    .insert({
      user_id: user.id,
      news_topics: ["tech", "finance", "general"],
      flashcard_enabled: true,
      news_enabled: true,
      ai_summary_enabled: true,
    })
    .select()
    .single();

  return created as LearningPreferences | null;
}

export async function updateLearningPreferences(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const allTopics: NewsTopic[] = ["tech", "finance", "general", "science", "health"];
  const selectedTopics = allTopics.filter((t) => formData.get(`topic_${t}`) === "on");

  const updates = {
    news_topics: selectedTopics.length > 0 ? selectedTopics : ["general"],
    news_enabled: formData.get("news_enabled") === "on",
    ai_summary_enabled: formData.get("ai_summary_enabled") === "on",
    flashcard_enabled: formData.get("flashcard_enabled") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("learning_preferences")
    .update(updates)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/learn");
  return { success: true };
}

export async function getDailyContent(
  date: string,
  contentType: "news_briefing" | "ai_summary"
): Promise<DailyContent | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("daily_content")
    .select("*")
    .eq("user_id", user.id)
    .eq("content_date", date)
    .eq("content_type", contentType)
    .single();

  return data as DailyContent | null;
}

export async function generateNewsBriefing(topics: NewsTopic[], force = false): Promise<DailyContent | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const openai = getOpenAIClient();
  const today = new Date().toISOString().split("T")[0];

  // Check cache first (skip when force=true)
  if (!force) {
    const { data: existing } = await supabase
      .from("daily_content")
      .select("*")
      .eq("user_id", user.id)
      .eq("content_date", today)
      .eq("content_type", "news_briefing")
      .single();

    if (existing) return existing as DailyContent;
  }

  // Fetch yesterday's briefing for continuity context
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Phase 1: fire yesterday DB query and all RSS fetches in parallel
  const [yesterdayRow, ...xmlTexts] = await Promise.all([
    supabase
      .from("daily_content")
      .select("content")
      .eq("user_id", user.id)
      .eq("content_date", yesterdayStr)
      .eq("content_type", "news_briefing")
      .single()
      .then(r => r.data),
    ...topics.map(topic =>
      fetch(RSS_FEEDS[topic], { headers: { "User-Agent": "Lifeboard/1.0" }, next: { revalidate: 3600 } })
        .then(r => r.text())
        .catch(() => "")
    ),
  ]);

  const yesterdayHeadlines: Partial<Record<NewsTopic, string>> = {};
  if (yesterdayRow) {
    const yesterdayBriefing = (yesterdayRow as { content: NewsBriefingContent }).content;
    for (const b of yesterdayBriefing.briefings) {
      yesterdayHeadlines[b.topic] = b.headlines.map((h) => h.title).join("; ");
    }
  }

  // Phase 2: run all per-topic OpenAI calls in parallel
  const briefings = await Promise.all(
    topics.map(async (topic, i) => {
      const headlines = parseRSSFeed(xmlTexts[i] ?? "");

      if (headlines.length === 0) {
        return { topic, headlines: [], summary: "No headlines available." } as TopicBriefing;
      }

      const fallbackSummary = headlines.map((h) => h.title).join("; ");

      if (openai) {
        try {
          const yesterdayContext = yesterdayHeadlines[topic] || "None";
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  'You are an editorial news analyst. Given today\'s headlines and optional context from yesterday\'s stories, produce a JSON object with:\n- "summary": 3-4 sentence overview of what\'s happening today in this topic area\n- "analysis": 2-3 sentences on why these developments matter — implications, broader significance\n- "continuing": if today\'s headlines clearly continue or update a story from yesterday\'s context, write 1-2 sentences noting the thread; otherwise return null\nReturn only the JSON object.',
              },
              {
                role: "user",
                content: `Topic: ${topic}\nToday's headlines:\n${headlines.map((h) => `- ${h.title}: ${h.description}`).join("\n")}\n\nYesterday's headlines (for continuity check):\n${yesterdayContext}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 300,
          });
          const raw = completion.choices[0]?.message?.content || "";
          const parsed = JSON.parse(raw);
          return {
            topic,
            headlines,
            summary: parsed.summary || fallbackSummary,
            analysis: parsed.analysis || undefined,
            continuing: parsed.continuing || undefined,
          } as TopicBriefing;
        } catch {
          // fallback below
        }
      }

      return { topic, headlines, summary: fallbackSummary } as TopicBriefing;
    })
  );

  const content: NewsBriefingContent = {
    briefings,
    generated_at: new Date().toISOString(),
  };

  const { data: stored } = await supabase
    .from("daily_content")
    .upsert(
      {
        user_id: user.id,
        content_date: today,
        content_type: "news_briefing",
        content,
      },
      { onConflict: "user_id,content_date,content_type" }
    )
    .select()
    .single();

  return stored as DailyContent | null;
}

export async function generateAISummary(topics: NewsTopic[], force = false): Promise<DailyContent | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split("T")[0];

  // Check cache first (skip when force=true)
  if (!force) {
    const { data: existing } = await supabase
      .from("daily_content")
      .select("*")
      .eq("user_id", user.id)
      .eq("content_date", today)
      .eq("content_type", "ai_summary")
      .single();

    if (existing) return existing as DailyContent;
  }

  const openai = getOpenAIClient();
  if (!openai) return null;

  const topicStr = topics.join(", ");

  // Build context from today's real news briefing if available
  let newsContext = "";
  const { data: briefingRow } = await supabase
    .from("daily_content")
    .select("content")
    .eq("user_id", user.id)
    .eq("content_date", today)
    .eq("content_type", "news_briefing")
    .single();

  if (briefingRow) {
    const briefing = briefingRow.content as NewsBriefingContent;
    newsContext = briefing.briefings
      .map((b) => `${b.topic}: ${b.headlines.map((h) => h.title).join("; ")}\nSummary: ${b.summary}`)
      .join("\n\n");
  }

  const systemPrompt = newsContext
    ? `You are a daily learning assistant. Based on the real news headlines below, generate a JSON object with these exact fields:
- "summary": 2-3 sentences covering key developments from the news today
- "fun_fact": one fascinating fact inspired by or related to today's news
- "learning_tip": one actionable learning tip for today
Return only the JSON object.

Today's headlines:
${newsContext}`
    : `You are a daily learning assistant. Generate a JSON object with these exact fields:
- "summary": 2-3 sentences covering today's key developments in ${topicStr}
- "fun_fact": one fascinating fact related to ${topicStr}
- "learning_tip": one actionable learning tip for today
Return only the JSON object.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: newsContext
          ? "Generate today's learning briefing based on the headlines above."
          : `Generate today's learning briefing for topics: ${topicStr}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 300,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  let parsed: { summary: string; fun_fact: string; learning_tip: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const content: AISummaryContent = {
    summary: parsed.summary || "",
    fun_fact: parsed.fun_fact || "",
    learning_tip: parsed.learning_tip || "",
    generated_at: new Date().toISOString(),
  };

  const { data: stored } = await supabase
    .from("daily_content")
    .upsert(
      {
        user_id: user.id,
        content_date: today,
        content_type: "ai_summary",
        content,
      },
      { onConflict: "user_id,content_date,content_type" }
    )
    .select()
    .single();

  return stored as DailyContent | null;
}
