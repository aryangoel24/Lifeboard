// Service layer for chat data. No "use server", no getUser(), no revalidatePath().
// All functions take (supabase, userId) from the route handler.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserMemory } from "@/types/database";

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function topN(arr: string[], n: number): string[] {
  const freq: Record<string, number> = {};
  for (const s of arr) freq[s] = (freq[s] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function computeDirection(data: Array<{ calories: number; logged_at: string }>): "up" | "down" | "stable" {
  if (data.length < 4) return "stable";
  const sorted = [...data].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const half = Math.floor(sorted.length / 2);
  const firstHalf = avg(sorted.slice(0, half).map((d) => d.calories));
  const secondHalf = avg(sorted.slice(half).map((d) => d.calories));
  const diff = secondHalf - firstHalf;
  if (Math.abs(diff) < 50) return "stable";
  return diff > 0 ? "up" : "down";
}

export type FoodSummary = {
  avg_calories: number;
  avg_protein: number;
  avg_carbs: number;
  avg_fat: number;
  top_foods: string[];
  trend: "up" | "down" | "stable";
  days_logged: number;
  total_entries: number;
};

export async function getFoodSummary(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<FoodSummary> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from("food_entries")
    .select("calories, protein, carbs, fat, name, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", since);

  const rows = data ?? [];
  const uniqueDays = new Set(rows.map((r: { logged_at: string }) => r.logged_at.split("T")[0]));

  return {
    avg_calories: Math.round(avg(rows.map((d: { calories: number }) => d.calories))),
    avg_protein: Math.round(avg(rows.map((d: { protein: number }) => d.protein))),
    avg_carbs: Math.round(avg(rows.map((d: { carbs: number }) => d.carbs))),
    avg_fat: Math.round(avg(rows.map((d: { fat: number }) => d.fat))),
    top_foods: topN(rows.map((d: { name: string }) => d.name), 5),
    trend: computeDirection(rows),
    days_logged: uniqueDays.size,
    total_entries: rows.length,
  };
}

export type TodayFoodSummary = {
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  entries: Array<{ name: string; calories: number; protein: number; meal_category: string; logged_at: string }>;
};

export async function getTodayFoodSummary(
  supabase: SupabaseClient,
  userId: string,
  timezone: string
): Promise<TodayFoodSummary> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const startOfDay = `${todayStr}T00:00:00.000Z`;
  // We query a 48-hour window around today to handle timezone offsets
  const windowStart = new Date(new Date(startOfDay).getTime() - 14 * 3600000).toISOString();
  const windowEnd = new Date(new Date(startOfDay).getTime() + 38 * 3600000).toISOString();

  const { data } = await supabase
    .from("food_entries")
    .select("name, calories, protein, carbs, fat, meal_category, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", windowStart)
    .lte("logged_at", windowEnd)
    .order("logged_at", { ascending: true });

  const rows = (data ?? []).filter((r: { logged_at: string }) => {
    const localDate = new Date(r.logged_at).toLocaleDateString("en-CA", { timeZone: timezone });
    return localDate === todayStr;
  });

  return {
    total_calories: rows.reduce((s: number, r: { calories: number }) => s + r.calories, 0),
    total_protein: rows.reduce((s: number, r: { protein: number }) => s + r.protein, 0),
    total_carbs: rows.reduce((s: number, r: { carbs: number }) => s + r.carbs, 0),
    total_fat: rows.reduce((s: number, r: { fat: number }) => s + r.fat, 0),
    entries: rows,
  };
}

export type DayFoodLog = {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  entries: Array<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meal_category: string;
    logged_at: string;
  }>;
};

export async function getFoodForDate(
  supabase: SupabaseClient,
  userId: string,
  date: string, // YYYY-MM-DD in user's timezone
  timezone: string
): Promise<DayFoodLog> {
  // Query a 48-hour window centred on the date to handle any timezone offset in stored timestamps
  const dayStart = new Date(`${date}T00:00:00`);
  const windowStart = new Date(dayStart.getTime() - 14 * 3600000).toISOString();
  const windowEnd = new Date(dayStart.getTime() + 38 * 3600000).toISOString();

  const { data } = await supabase
    .from("food_entries")
    .select("name, calories, protein, carbs, fat, meal_category, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", windowStart)
    .lte("logged_at", windowEnd)
    .order("logged_at", { ascending: true });

  // Keep only entries whose local date matches the requested date
  const rows = (data ?? []).filter((r: { logged_at: string }) => {
    const localDate = new Date(r.logged_at).toLocaleDateString("en-CA", { timeZone: timezone });
    return localDate === date;
  });

  return {
    date,
    total_calories: rows.reduce((s: number, r: { calories: number }) => s + r.calories, 0),
    total_protein: rows.reduce((s: number, r: { protein: number }) => s + r.protein, 0),
    total_carbs: rows.reduce((s: number, r: { carbs: number }) => s + r.carbs, 0),
    total_fat: rows.reduce((s: number, r: { fat: number }) => s + r.fat, 0),
    entries: rows,
  };
}

export type HabitSummary = {
  gym_days: number;
  gym_rate: number;
  creatine_rate: number;
  magnesium_rate: number;
  custom_habits: Array<{ name: string; completion_rate: number }>;
};

export async function getHabitSummary(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<HabitSummary> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [habitData, customHabitsData, customEntriesData] = await Promise.all([
    supabase
      .from("habit_entries")
      .select("habit_type, logged_at, value")
      .eq("user_id", userId)
      .gte("logged_at", since),
    supabase
      .from("custom_habits")
      .select("id, name")
      .eq("user_id", userId)
      .eq("archived", false),
    supabase
      .from("habit_entries")
      .select("custom_habit_id, value")
      .eq("user_id", userId)
      .eq("habit_type", "custom")
      .gte("logged_at", since),
  ]);

  const entries = habitData.data ?? [];
  const gymDays = entries.filter((e: { habit_type: string; value: number }) => e.habit_type === "gym" && e.value > 0).length;
  const creatineDays = entries.filter((e: { habit_type: string; value: number }) => e.habit_type === "creatine" && e.value > 0).length;
  const magnesiumDays = entries.filter((e: { habit_type: string; value: number }) => e.habit_type === "magnesium" && e.value > 0).length;

  const customHabits = (customHabitsData.data ?? []).map((h: { id: string; name: string }) => {
    const completed = (customEntriesData.data ?? []).filter(
      (e: { custom_habit_id: string; value: number }) => e.custom_habit_id === h.id && e.value > 0
    ).length;
    return { name: h.name, completion_rate: Math.round((completed / days) * 100) / 100 };
  });

  return {
    gym_days: gymDays,
    gym_rate: Math.round((gymDays / days) * 100) / 100,
    creatine_rate: Math.round((creatineDays / days) * 100) / 100,
    magnesium_rate: Math.round((magnesiumDays / days) * 100) / 100,
    custom_habits: customHabits,
  };
}

export type WeightTrend = {
  current_weight: number | null;
  avg_weight_30d: number | null;
  min_weight: number | null;
  max_weight: number | null;
  trend: "increasing" | "decreasing" | "stable" | "insufficient_data";
  rate_lbs_per_week: number | null;
  entries_count: number;
};

export async function getWeightTrend(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<WeightTrend> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from("weight_entries")
    .select("weight, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", since)
    .order("logged_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) {
    return { current_weight: null, avg_weight_30d: null, min_weight: null, max_weight: null, trend: "insufficient_data", rate_lbs_per_week: null, entries_count: 0 };
  }

  const weights = rows.map((r: { weight: number }) => r.weight);
  const avgWeight = avg(weights);
  const current = weights[weights.length - 1];

  let trend: WeightTrend["trend"] = "stable";
  let rate: number | null = null;

  if (rows.length >= 4) {
    const half = Math.floor(rows.length / 2);
    const firstHalfAvg = avg(rows.slice(0, half).map((r: { weight: number }) => r.weight));
    const secondHalfAvg = avg(rows.slice(half).map((r: { weight: number }) => r.weight));
    const diff = secondHalfAvg - firstHalfAvg;
    if (Math.abs(diff) < 0.5) trend = "stable";
    else trend = diff > 0 ? "increasing" : "decreasing";

    // Compute rate lbs/week using linear regression
    const first = rows[0];
    const last = rows[rows.length - 1];
    const daysDiff = (new Date(last.logged_at).getTime() - new Date(first.logged_at).getTime()) / 86400000;
    if (daysDiff > 0) {
      rate = Math.round(((last.weight - first.weight) / daysDiff) * 7 * 10) / 10;
    }
  } else {
    trend = "insufficient_data";
  }

  return {
    current_weight: Math.round(current * 10) / 10,
    avg_weight_30d: Math.round(avgWeight * 10) / 10,
    min_weight: Math.min(...weights),
    max_weight: Math.max(...weights),
    trend,
    rate_lbs_per_week: rate,
    entries_count: rows.length,
  };
}

export type BudgetData = {
  total_spent: number;
  food_spent: number;
  weekly_budget: number | null;
  budget_remaining: number | null;
  top_categories: Array<{ category: string; amount: number }>;
};

export async function getBudgetData(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<BudgetData> {
  const [expensesData, budgetGoalData] = await Promise.all([
    supabase
      .from("expense_entries")
      .select("amount, category")
      .eq("user_id", userId)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate),
    supabase
      .from("budget_goals")
      .select("amount, period, category")
      .eq("user_id", userId)
      .is("category", null)
      .eq("period", "weekly")
      .limit(1),
  ]);

  const expenses = expensesData.data ?? [];
  const totalSpent = expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0);
  const weeklyBudget = budgetGoalData.data?.[0]?.amount ?? null;

  const catTotals: Record<string, number> = {};
  for (const e of expenses) {
    const cat = (e as { category: string | null }).category ?? "other";
    catTotals[cat] = (catTotals[cat] || 0) + (e as { amount: number }).amount;
  }
  const topCategories = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }));

  // Food spending from food_entries cost column
  const { data: foodData } = await supabase
    .from("food_entries")
    .select("cost")
    .eq("user_id", userId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  const foodSpent = (foodData ?? []).reduce(
    (s: number, e: { cost: number | null }) => s + (e.cost ?? 0),
    0
  );

  return {
    total_spent: Math.round(totalSpent * 100) / 100,
    food_spent: Math.round(foodSpent * 100) / 100,
    weekly_budget: weeklyBudget,
    budget_remaining: weeklyBudget !== null ? Math.round((weeklyBudget - totalSpent) * 100) / 100 : null,
    top_categories: topCategories,
  };
}

export type PantrySnapshot = {
  total_items: number;
  categories: string[];
  items: Array<{ name: string; category: string; stock_quantity: number | null; stock_unit: string | null }>;
};

export async function getPantrySnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<PantrySnapshot> {
  const { data } = await supabase
    .from("pantry_items")
    .select("name, category, stock_quantity, stock_unit")
    .eq("user_id", userId)
    .order("name");

  const items = data ?? [];
  const categories = Array.from(new Set(items.map((i: { category: string }) => i.category)));

  return {
    total_items: items.length,
    categories,
    items,
  };
}

export type RecipeListSummary = {
  total: number;
  recipes: Array<{ id: string; name: string; total_calories: number; total_protein: number; tags: string[] }>;
};

export async function getRecipeList(
  supabase: SupabaseClient,
  userId: string
): Promise<RecipeListSummary> {
  const { data } = await supabase
    .from("recipes")
    .select("id, name, total_calories, total_protein, tags")
    .eq("user_id", userId)
    .order("name");

  return { total: data?.length ?? 0, recipes: data ?? [] };
}

export type KnowledgeSnapshot = {
  total_nodes: number;
  mastery_breakdown: Record<string, number>;
  top_topics: string[];
  recently_reviewed: string[];
};

export async function getKnowledgeSnapshot(
  supabase: SupabaseClient,
  userId: string,
  masteryFilter?: string
): Promise<KnowledgeSnapshot> {
  let query = supabase
    .from("knowledge_nodes")
    .select("title, mastery_status, last_reviewed_at")
    .eq("user_id", userId);

  if (masteryFilter) query = query.eq("mastery_status", masteryFilter);

  const { data } = await query.order("last_reviewed_at", { ascending: false });
  const nodes = data ?? [];

  const masteryBreakdown: Record<string, number> = {};
  for (const n of nodes) {
    const status = (n as { mastery_status: string }).mastery_status;
    masteryBreakdown[status] = (masteryBreakdown[status] || 0) + 1;
  }

  const recentlyReviewed = nodes
    .filter((n: { last_reviewed_at: string | null }) => n.last_reviewed_at)
    .slice(0, 5)
    .map((n: { title: string }) => n.title);

  return {
    total_nodes: nodes.length,
    mastery_breakdown: masteryBreakdown,
    top_topics: nodes.slice(0, 10).map((n: { title: string }) => n.title),
    recently_reviewed: recentlyReviewed,
  };
}

export type KnowledgeNodeResult = {
  id: string;
  title: string;
  depth: number;
  mastery_status: string;
  key_facts: string[];
  node_type: string;
  parent_title: string | null;
};

export async function searchKnowledgeNodes(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<KnowledgeNodeResult[]> {
  // First: find nodes whose title matches the query
  const { data: titleMatches } = await supabase
    .from("knowledge_nodes")
    .select("id, title, depth, mastery_status, key_facts, node_type, parent_id")
    .eq("user_id", userId)
    .ilike("title", `%${query}%`)
    .order("depth", { ascending: true })
    .limit(30);

  const nodes = titleMatches ?? [];

  // If there's an exact or close root match (depth 0 or 1), also fetch its children
  const rootMatch = nodes.find(
    (n) => n.title.toLowerCase().includes(query.toLowerCase()) && n.depth <= 1
  );

  let children: typeof nodes = [];
  if (rootMatch) {
    const { data: childData } = await supabase
      .from("knowledge_nodes")
      .select("id, title, depth, mastery_status, key_facts, node_type, parent_id")
      .eq("user_id", userId)
      .eq("parent_id", rootMatch.id)
      .order("title", { ascending: true })
      .limit(50);
    children = childData ?? [];
  }

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged = [...nodes, ...children].filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Resolve parent titles in one batch
  const parentIds = Array.from(new Set(merged.map((n) => n.parent_id).filter(Boolean))) as string[];
  const parentTitleMap: Record<string, string> = {};
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("knowledge_nodes")
      .select("id, title")
      .in("id", parentIds);
    for (const p of parents ?? []) parentTitleMap[p.id] = p.title;
  }

  return merged.map((n) => ({
    id: n.id,
    title: n.title,
    depth: n.depth,
    mastery_status: n.mastery_status,
    key_facts: n.key_facts ?? [],
    node_type: n.node_type,
    parent_title: n.parent_id ? (parentTitleMap[n.parent_id] ?? null) : null,
  }));
}

export type JournalSummary = {
  recent_entries: Array<{ summary: string | null; date: string; raw_preview: string }>;
  total_count: number;
};

export async function getJournalSummary(
  supabase: SupabaseClient,
  userId: string,
  limit: number
): Promise<JournalSummary> {
  const { data, count } = await supabase
    .from("daily_digests")
    .select("date, summary, raw_text", { count: "exact" })
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);

  const entries = (data ?? []).map((e: { date: string; summary: string | null; raw_text: string }) => ({
    date: e.date,
    summary: e.summary,
    raw_preview: e.raw_text?.slice(0, 200) ?? "",
  }));

  return { recent_entries: entries, total_count: count ?? 0 };
}

export type JournalSearchResult = {
  happened_at: string;
  title: string | null;
  summary: string | null;
  raw_text: string | null;
  extracted_people: string[] | null;
  extracted_places: string[] | null;
};

export async function searchJournal(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<JournalSearchResult[]> {
  const q = `%${query}%`;
  const cols = ["title", "raw_text", "summary"] as const;
  // Run one ilike query per text column — avoids PostgREST % parsing issues in .or()
  const textQueries = cols.map((col) =>
    supabase
      .from("events")
      .select("happened_at, title, summary, raw_text, extracted_people, extracted_places")
      .eq("user_id", userId)
      .ilike(col, q)
      .order("happened_at", { ascending: false })
      .limit(10)
  );
  const results = await Promise.all(textQueries);

  // Merge and deduplicate by happened_at + title
  const seen = new Set<string>();
  const merged: JournalSearchResult[] = [];

  for (const result of results) {
    for (const row of (result.data ?? [])) {
      const key = `${row.happened_at}:${row.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          happened_at: row.happened_at,
          title: row.title,
          summary: row.summary,
          raw_text: row.raw_text,
          extracted_people: row.extracted_people,
          extracted_places: row.extracted_places,
        });
      }
    }
  }

  return merged.sort((a, b) => b.happened_at.localeCompare(a.happened_at));
}

export type ProfileData = {
  daily_calories_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  goal_weight: number | null;
  gym_weekly_goal: number;
  timezone: string;
};

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileData | null> {
  const { data } = await supabase
    .from("profiles")
    .select("daily_calories_goal, daily_protein_goal, daily_carbs_goal, daily_fat_goal, goal_weight, gym_weekly_goal, timezone")
    .eq("id", userId)
    .single();

  return data ?? null;
}

export type MemorySummary = {
  explicit: {
    preferences: string[];
    facts: string[];
  };
  inferred: {
    patterns: string[];
  };
  total_count: number;
};

export async function getMemorySummary(
  supabase: SupabaseClient,
  userId: string
): Promise<MemorySummary> {
  const { data } = await supabase
    .from("user_memory")
    .select("memory_source, type, content, confidence")
    .eq("user_id", userId)
    .order("confidence", { ascending: false });

  const memories = (data ?? []) as UserMemory[];

  const explicit = {
    preferences: memories
      .filter((m) => m.memory_source === "explicit" && m.type === "preference")
      .map((m) => m.content),
    facts: memories
      .filter((m) => m.memory_source === "explicit" && m.type === "fact")
      .map((m) => m.content),
  };

  const inferred = {
    patterns: memories
      .filter((m) => m.memory_source === "inferred")
      .map((m) => m.content),
  };

  return { explicit, inferred, total_count: memories.length };
}

export async function searchMemory(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<UserMemory[]> {
  const { data } = await supabase
    .from("user_memory")
    .select("*")
    .eq("user_id", userId)
    .ilike("content", `%${query}%`);

  return data ?? [];
}

export async function getMemoriesBySourceAndType(
  supabase: SupabaseClient,
  userId: string,
  memorySource: string,
  type: string
): Promise<UserMemory[]> {
  const { data } = await supabase
    .from("user_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("memory_source", memorySource)
    .eq("type", type);

  return data ?? [];
}

export async function insertMemory(
  supabase: SupabaseClient,
  userId: string,
  memory: {
    memory_source: string;
    type: string;
    content: string;
    confidence: number;
    observation_count: number;
  }
): Promise<void> {
  await supabase.from("user_memory").insert({ ...memory, user_id: userId });
}

export async function updateMemory(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  updates: {
    content: string;
    confidence: number;
    observation_count: number;
    updated_at: string;
  }
): Promise<void> {
  await supabase.from("user_memory").update(updates).eq("id", id).eq("user_id", userId);
}

export type HabitVsNutritionAnalysis = {
  habit: string;
  days_with_habit: number;
  days_without_habit: number;
  avg_calories_with: number;
  avg_calories_without: number;
  calorie_difference: number;
  avg_protein_with: number;
  avg_protein_without: number;
};

export async function analyzeHabitVsNutrition(
  supabase: SupabaseClient,
  userId: string,
  habit: string,
  days: number
): Promise<HabitVsNutritionAnalysis> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [habitEntries, foodEntries] = await Promise.all([
    supabase
      .from("habit_entries")
      .select("logged_at, value, habit_type, custom_habit_id")
      .eq("user_id", userId)
      .gte("logged_at", since),
    supabase
      .from("food_entries")
      .select("calories, protein, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", since),
  ]);

  const habitRows = (habitEntries.data ?? []).filter(
    (e: { habit_type: string; value: number }) => e.habit_type === habit && e.value > 0
  );
  const gymDates = new Set(habitRows.map((e: { logged_at: string }) => e.logged_at.split("T")[0]));

  const foodByDay: Record<string, { calories: number[]; protein: number[] }> = {};
  for (const e of foodEntries.data ?? []) {
    const day = (e as { logged_at: string }).logged_at.split("T")[0];
    if (!foodByDay[day]) foodByDay[day] = { calories: [], protein: [] };
    foodByDay[day].calories.push((e as { calories: number }).calories);
    foodByDay[day].protein.push((e as { protein: number }).protein);
  }

  const withHabit: Array<{ calories: number; protein: number }> = [];
  const withoutHabit: Array<{ calories: number; protein: number }> = [];

  for (const [day, vals] of Object.entries(foodByDay)) {
    const dayTotal = { calories: vals.calories.reduce((a, b) => a + b, 0), protein: vals.protein.reduce((a, b) => a + b, 0) };
    if (gymDates.has(day)) withHabit.push(dayTotal);
    else withoutHabit.push(dayTotal);
  }

  const avgCalWith = Math.round(avg(withHabit.map((d) => d.calories)));
  const avgCalWithout = Math.round(avg(withoutHabit.map((d) => d.calories)));

  return {
    habit,
    days_with_habit: withHabit.length,
    days_without_habit: withoutHabit.length,
    avg_calories_with: avgCalWith,
    avg_calories_without: avgCalWithout,
    calorie_difference: avgCalWith - avgCalWithout,
    avg_protein_with: Math.round(avg(withHabit.map((d) => d.protein))),
    avg_protein_without: Math.round(avg(withoutHabit.map((d) => d.protein))),
  };
}

export type MealSuggestion = {
  name: string;
  estimated_calories: number;
  estimated_protein: number;
  pantry_items_used: string[];
};

export async function suggestMealsFromPantry(
  supabase: SupabaseClient,
  userId: string,
  targetCal?: number
): Promise<MealSuggestion[]> {
  const { data } = await supabase
    .from("pantry_items")
    .select("name, category, calories_per_base, protein_per_base, base_unit")
    .eq("user_id", userId);

  const items = data ?? [];
  const proteins = items.filter((i: { category: string }) => i.category === "protein");
  const grains = items.filter((i: { category: string }) => i.category === "grain");
  const veggies = items.filter((i: { category: string }) => i.category === "vegetable");

  const suggestions: MealSuggestion[] = [];

  for (const protein of proteins.slice(0, 3)) {
    const grain = grains[Math.floor(Math.random() * Math.max(grains.length, 1))];
    const veggie = veggies[Math.floor(Math.random() * Math.max(veggies.length, 1))];

    const used: string[] = [(protein as { name: string }).name];
    let cal = (protein as { calories_per_base: number }).calories_per_base * 3;
    let prot = (protein as { protein_per_base: number }).protein_per_base * 3;

    if (grain) {
      used.push((grain as { name: string }).name);
      cal += (grain as { calories_per_base: number }).calories_per_base;
      prot += (grain as { protein_per_base: number }).protein_per_base;
    }
    if (veggie) {
      used.push((veggie as { name: string }).name);
      cal += (veggie as { calories_per_base: number }).calories_per_base * 0.5;
    }

    suggestions.push({
      name: `${(protein as { name: string }).name} bowl${grain ? ` with ${(grain as { name: string }).name}` : ""}`,
      estimated_calories: Math.round(cal),
      estimated_protein: Math.round(prot),
      pantry_items_used: used,
    });
  }

  // Sort by closest to target if provided
  if (targetCal) {
    suggestions.sort((a, b) => Math.abs(a.estimated_calories - targetCal) - Math.abs(b.estimated_calories - targetCal));
  }

  return suggestions.slice(0, 3);
}

export type StreakData = {
  logging_streak: number;
  gym_streak: number;
  goal_streak: number;
};

export async function getStreaks(
  supabase: SupabaseClient,
  userId: string
): Promise<StreakData> {
  const { data } = await supabase
    .from("user_streaks")
    .select("streak_type, current_count")
    .eq("user_id", userId);

  const streaks = data ?? [];
  const get = (type: string) =>
    streaks.find((s: { streak_type: string }) => s.streak_type === type)?.current_count ?? 0;

  return {
    logging_streak: get("logging"),
    gym_streak: get("gym"),
    goal_streak: get("goal"),
  };
}

export async function createFoodEntryService(
  supabase: SupabaseClient,
  userId: string,
  entry: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meal_category: string;
    logged_at: string;
    cost?: number | null;
    meal_source?: string | null;
  }
): Promise<void> {
  await supabase.from("food_entries").insert({ ...entry, user_id: userId });
}

export async function checkRecentDuplicate(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  withinMinutes: number
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60000).toISOString();
  const { data } = await supabase
    .from("food_entries")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .gte("created_at", since)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
