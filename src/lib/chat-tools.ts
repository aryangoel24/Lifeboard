import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeInsights } from "@/lib/chat-insights";
import {
  getFoodSummary,
  getFoodForDate,
  getHabitSummary,
  getWeightTrend,
  getBudgetData,
  getPantrySnapshot,
  getRecipeList,
  getKnowledgeSnapshot,
  searchKnowledgeNodes,
  getJournalSummary,
  searchJournal,
  getProfile,
  getMemorySummary,
  searchMemory,
  getMemoriesBySourceAndType,
  insertMemory,
  updateMemory,
  analyzeHabitVsNutrition,
  suggestMealsFromPantry,
} from "@/lib/services/chat-data";
import { findSimilarMemory } from "@/lib/services/memory-dedupe";
import { getToday, getStartOfWeek } from "@/lib/timezone";

export function buildChatTools(supabase: SupabaseClient, userId: string) {
  return {
    get_insights: tool({
      description:
        "Get precomputed insights about the user — TDEE estimate, 7-day avg calories, protein adherence, weight trend, gym rate, streaks, today's totals, and budget. Call this early in complex conversations to orient yourself.",
      inputSchema: z.object({}),
      execute: async () => computeInsights(supabase, userId),
    }),

    get_food_summary: tool({
      description:
        "Get a food summary for a given number of days: average calories/protein/carbs/fat, top foods, trend, and days logged. Use this for trends and multi-day analysis. For a specific date (e.g. 'yesterday', 'Monday'), use get_food_for_date instead.",
      inputSchema: z.object({
        days: z.number().min(1).max(90).describe("Number of past days to analyze"),
      }),
      execute: async (input) => getFoodSummary(supabase, userId, input.days),
    }),

    get_food_for_date: tool({
      description:
        "Get the complete food log for a specific date — every entry with name, calories, macros, and meal category. Use this when the user asks what they ate on a specific day (today, yesterday, a weekday, or a YYYY-MM-DD date). Always prefer this over get_food_summary for single-day questions.",
      inputSchema: z.object({
        date: z
          .string()
          .describe(
            "Date in YYYY-MM-DD format (user's local timezone). For 'today' use today's date, for 'yesterday' subtract 1 day."
          ),
      }),
      execute: async (input) => {
        const profile = await getProfile(supabase, userId);
        const timezone = profile?.timezone ?? "UTC";
        return getFoodForDate(supabase, userId, input.date, timezone);
      },
    }),

    get_habit_summary: tool({
      description:
        "Get habit completion rates for gym, creatine, magnesium, and custom habits over the given number of days.",
      inputSchema: z.object({
        days: z.number().min(1).max(90).describe("Number of past days to analyze"),
      }),
      execute: async (input) => getHabitSummary(supabase, userId, input.days),
    }),

    get_weight_trend: tool({
      description:
        "Get weight trend data: current weight, average, min/max, trend direction, and rate of change in lbs/week.",
      inputSchema: z.object({
        days: z.number().min(7).max(180).describe("Number of past days to analyze"),
      }),
      execute: async (input) => getWeightTrend(supabase, userId, input.days),
    }),

    get_budget_data: tool({
      description: "Get budget and spending data for a date range.",
      inputSchema: z.object({
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (input) =>
        getBudgetData(supabase, userId, input.start_date, input.end_date),
    }),

    get_pantry: tool({
      description: "Get current pantry inventory — items, categories, and stock levels.",
      inputSchema: z.object({}),
      execute: async () => getPantrySnapshot(supabase, userId),
    }),

    get_recipes: tool({
      description: "Get the user's recipe list with names, calories, protein, and tags.",
      inputSchema: z.object({}),
      execute: async () => getRecipeList(supabase, userId),
    }),

    get_knowledge_snapshot: tool({
      description:
        "Get knowledge graph summary — total nodes, mastery breakdown (not_started/learning/practicing/mastered), top topics, and recently reviewed.",
      inputSchema: z.object({
        mastery_filter: z
          .enum(["not_started", "learning", "practicing", "mastered"])
          .optional()
          .describe("Optional filter to only show nodes at a given mastery level"),
      }),
      execute: async (input) =>
        getKnowledgeSnapshot(supabase, userId, input.mastery_filter),
    }),

    search_knowledge_nodes: tool({
      description:
        "Search knowledge graph nodes by name — returns matching nodes plus all children of any matched root node. Use this when the user asks about topics, courses, skills, or concepts in their knowledge graph (e.g. 'university courses', 'machine learning', 'piano'). Prefer this over get_knowledge_snapshot for specific topic lookups.",
      inputSchema: z.object({
        query: z.string().describe("Topic or node name to search for (e.g. 'university', 'machine learning', 'piano')"),
      }),
      execute: async (input) => searchKnowledgeNodes(supabase, userId, input.query),
    }),

    get_journal_summary: tool({
      description: "Get recent journal/digest entries with summaries. Use search_journal to find entries by keyword.",
      inputSchema: z.object({
        limit: z.number().min(1).max(20).default(5).describe("Number of recent entries to return"),
      }),
      execute: async (input) => getJournalSummary(supabase, userId, input.limit),
    }),

    search_journal: tool({
      description:
        "Search journal entries by keyword — people, places, events, activities. Returns matching events with title, summary, raw_text, extracted_people, extracted_places, and happened_at. Use this when the user asks about a specific event, person, or activity they may have logged (e.g. 'Inter Miami game', 'Armaan', 'concert', 'trip to'). Try broad keywords for best results.",
      inputSchema: z.object({
        query: z.string().describe("Keyword or phrase to search for across all journal entries"),
      }),
      execute: async (input) => searchJournal(supabase, userId, input.query),
    }),

    get_profile: tool({
      description: "Get user's goal settings: calorie goal, protein goal, carb goal, fat goal, goal weight, gym weekly goal, timezone.",
      inputSchema: z.object({}),
      execute: async () => getProfile(supabase, userId),
    }),

    get_memory_summary: tool({
      description:
        "Get a structured summary of what is known about this user — grouped by source (explicit/inferred) and type (preference/fact/pattern). Call this before write_memory to check for existing entries.",
      inputSchema: z.object({}),
      execute: async () => getMemorySummary(supabase, userId),
    }),

    search_memory: tool({
      description: "Search memory entries for a specific topic (e.g., 'gym', 'protein', 'budget').",
      inputSchema: z.object({
        query: z.string().describe("Keyword or phrase to search for"),
      }),
      execute: async (input) => searchMemory(supabase, userId, input.query),
    }),

    write_memory: tool({
      description: `Store something learned about the user.

Hard rules you MUST follow:
1. Only write if confidence >= 0.85
2. For 'inferred' memories: only write after observing a pattern across 3+ turns or sessions
3. For 'explicit' memories: write immediately if the user directly states a fact or preference
4. Always call get_memory_summary() first — check for similar entries before writing
5. Prefer updating an existing entry over inserting; the executor handles deduplication automatically
6. Never infer sensitive facts (health conditions, personal problems) from a single message
7. Write specific, falsifiable statements — not vague generalizations`,
      inputSchema: z.object({
        memory_source: z.enum(["explicit", "inferred"]),
        type: z.enum(["preference", "pattern", "fact"]),
        content: z
          .string()
          .max(200)
          .describe("Single specific, falsifiable statement about the user."),
        confidence: z
          .number()
          .min(0.85)
          .max(1.0)
          .describe("Confidence level — minimum 0.85 required"),
        observation_count: z
          .number()
          .min(1)
          .describe("How many observations support this memory"),
      }),
      execute: async (input) => {
        const existing = await getMemoriesBySourceAndType(
          supabase,
          userId,
          input.memory_source,
          input.type
        );
        const match = findSimilarMemory(
          { memory_source: input.memory_source, type: input.type, content: input.content },
          existing,
          0.6
        );

        if (match) {
          await updateMemory(supabase, userId, match.id, {
            content: input.content,
            confidence: Math.max(input.confidence, match.confidence),
            observation_count: match.observation_count + input.observation_count,
            updated_at: new Date().toISOString(),
          });
          return { action: "updated", id: match.id };
        }

        await insertMemory(supabase, userId, {
          memory_source: input.memory_source,
          type: input.type,
          content: input.content,
          confidence: input.confidence,
          observation_count: input.observation_count,
        });
        return { action: "inserted" };
      },
    }),

    analyze_habit_vs_nutrition: tool({
      description:
        "Analyze correlation between a habit and nutrition. E.g., 'Do I eat more calories on days I skip the gym?'",
      inputSchema: z.object({
        habit: z
          .string()
          .describe("Habit type to analyze: 'gym', 'creatine', 'magnesium', or a custom habit name"),
        days: z.number().min(7).max(90).describe("Number of past days to analyze"),
      }),
      execute: async (input) =>
        analyzeHabitVsNutrition(supabase, userId, input.habit, input.days),
    }),

    suggest_meals_from_pantry: tool({
      description: "Suggest meal ideas based on current pantry items, optionally targeting calorie/protein goals.",
      inputSchema: z.object({
        target_calories: z
          .number()
          .optional()
          .describe("Target calories for the meal (optional)"),
        target_protein: z
          .number()
          .optional()
          .describe("Target protein in grams for the meal (optional)"),
      }),
      execute: async (input) =>
        suggestMealsFromPantry(supabase, userId, input.target_calories),
    }),

    get_budget_this_week: tool({
      description: "Shortcut to get this week's budget and spending summary.",
      inputSchema: z.object({}),
      execute: async () => getBudgetData(supabase, userId, getStartOfWeek(), getToday()),
    }),
  };
}
