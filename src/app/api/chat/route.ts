import { streamText, generateText, stepCountIs, createUIMessageStream, createUIMessageStreamResponse, generateId, convertToModelMessages, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { buildChatTools } from "@/lib/chat-tools";
import { classifyIntent } from "@/lib/chat-intent";
import {
  getProfile,
  getTodayFoodSummary,
  getPantrySnapshot,
  checkRecentDuplicate,
  createFoodEntryService,
} from "@/lib/services/chat-data";

export const maxDuration = 60;

function textResponse(text: string): Response {
  const id = generateId();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", delta: text, id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

async function handleDirectFetch(
  key: "today_food" | "profile" | "pantry",
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Response> {
  if (key === "today_food") {
    const profile = await getProfile(supabase, userId);
    const timezone = profile?.timezone ?? "UTC";
    const summary = await getTodayFoodSummary(supabase, userId, timezone);
    const remaining = (profile?.daily_calories_goal ?? 0) - summary.total_calories;
    const text =
      `**Today's Nutrition**\n` +
      `Calories: ${summary.total_calories} / ${profile?.daily_calories_goal ?? "?"} kcal (${remaining >= 0 ? remaining + " remaining" : Math.abs(remaining) + " over"})\n` +
      `Protein: ${summary.total_protein}g / ${profile?.daily_protein_goal ?? "?"}g\n` +
      `Carbs: ${summary.total_carbs}g | Fat: ${summary.total_fat}g\n` +
      (summary.entries.length > 0
        ? `\nLogged: ${summary.entries.map((e) => (e as { name: string }).name).join(", ")}`
        : "\nNothing logged yet today.");
    return textResponse(text);
  }

  if (key === "profile") {
    const profile = await getProfile(supabase, userId);
    if (!profile) return textResponse("No profile found.");
    const text =
      `**Your Goals**\n` +
      `Calories: ${profile.daily_calories_goal} kcal\n` +
      `Protein: ${profile.daily_protein_goal}g\n` +
      `Carbs: ${profile.daily_carbs_goal}g\n` +
      `Fat: ${profile.daily_fat_goal}g\n` +
      (profile.goal_weight ? `Goal weight: ${profile.goal_weight} lbs\n` : "") +
      `Gym: ${profile.gym_weekly_goal}x/week`;
    return textResponse(text);
  }

  if (key === "pantry") {
    const pantry = await getPantrySnapshot(supabase, userId);
    if (pantry.total_items === 0) return textResponse("Your pantry is empty.");
    const text =
      `**Pantry** (${pantry.total_items} items)\n` +
      `Categories: ${pantry.categories.join(", ")}\n` +
      `Items: ${pantry.items
        .slice(0, 20)
        .map((i) => i.name + (i.stock_quantity ? ` (${i.stock_quantity} ${i.stock_unit ?? ""})` : ""))
        .join(", ")}` +
      (pantry.total_items > 20 ? ` … and ${pantry.total_items - 20} more` : "");
    return textResponse(text);
  }

  return textResponse("Unknown fetch key.");
}

async function handleDirectLogAction(
  description: string,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Response> {
  const wordCount = description.trim().split(/\s+/).length;
  if (wordCount < 2) {
    return textResponse(
      `I'm not sure I understood that. Could you be more specific? e.g. "log 200g chicken breast for lunch"`
    );
  }

  let nutrition: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meal_category: string;
  } | null = null;

  try {
    const parseResult = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system:
        'You are a nutrition estimator. Given a food description, output ONLY valid JSON with keys: name (string), calories (int), protein (float), carbs (float), fat (float), meal_category ("breakfast"|"lunch"|"dinner"|"snack"). No markdown, no explanation.',
      messages: [{ role: "user", content: description }],
    });
    nutrition = JSON.parse(parseResult.text);
  } catch {
    return textResponse(
      `I couldn't parse the nutrition for "${description}". Try being more specific, e.g. "200g grilled chicken breast for lunch".`
    );
  }

  if (!nutrition || !nutrition.calories || nutrition.calories < 10) {
    return textResponse(
      `I couldn't determine the nutrition for "${description}". Please try again with more detail.`
    );
  }

  const isDuplicate = await checkRecentDuplicate(supabase, userId, nutrition.name, 5);
  if (isDuplicate) {
    return textResponse(
      `Looks like you already logged "${nutrition.name}" just now — skipped to avoid a duplicate.`
    );
  }

  const profile = await getProfile(supabase, userId);
  const timezone = profile?.timezone ?? "UTC";
  const localNow =
    new Date().toLocaleString("sv", { timeZone: timezone }).replace(" ", "T") + ".000Z";

  await createFoodEntryService(supabase, userId, {
    name: nutrition.name,
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    meal_category: nutrition.meal_category,
    logged_at: localNow,
  });

  return textResponse(
    `Logged: **${nutrition.name}** — ${nutrition.calories} cal, ${nutrition.protein}g protein, ${nutrition.carbs}g carbs, ${nutrition.fat}g fat.`
  );
}

function buildSystemPrompt(
  profile: Awaited<ReturnType<typeof getProfile>>,
  memoryCount: number
): string {
  const today = new Date().toLocaleDateString("en-CA");
  return `You are Lifeboard AI — a personal reasoning system with access to this user's life data.

You have tools for: food tracking, weight, habits, budget, journal, pantry, recipes, and knowledge graph.
For single-day food questions ("what did I eat yesterday/today/Monday"), use get_food_for_date — it returns every entry with full detail. get_food_summary is for multi-day trends only.
For questions about specific events, people, or activities in the journal ("did I go to X", "when did I do Y"), use search_journal with relevant keywords — never assume the answer from get_journal_summary alone.
For questions about knowledge graph topics, courses, skills, or concepts, use search_knowledge_nodes — it returns children of matched nodes, so searching "university" will return all courses under that node.
You have get_memory_summary() and search_memory() to recall learned context.
You have write_memory() to persist new insights — use it sparingly, follow the rules in its description.

Rules:
- Call get_insights() early in new conversations to orient yourself
- Tools return compressed summaries — reason over signals, not raw data
- Surface non-obvious cross-domain patterns when relevant (e.g., gym days vs calorie intake)
- After complex sessions, consider writing memory for stable patterns you observed
- Offer follow-up actions when appropriate ("Want me to suggest meals from your pantry?")
- Be concise — no unsolicited bullet walls
- Never fabricate data — if unsure, call a tool

Today: ${today}
Calorie goal: ${profile?.daily_calories_goal ?? "unknown"} kcal | Protein goal: ${profile?.daily_protein_goal ?? "unknown"}g
Memory entries: ${memoryCount}`;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  // v6 useChat sends UIMessage[] (parts-based), not legacy content-based messages
  const messages: UIMessage[] = (body.messages ?? []).filter(
    (m: UIMessage) =>
      m.parts.some((p) => p.type === "text" && (p as { type: "text"; text: string }).text.trim().length > 0)
  );

  // Guard: nothing to process
  if (messages.length === 0) {
    return new Response("No messages", { status: 400 });
  }

  // Extract text from the last user message for intent routing
  const lastMsg = messages[messages.length - 1];
  const lastMessageText = lastMsg
    ? lastMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
    : "";

  // Guard: ignore if last message has no text content
  if (!lastMessageText.trim()) {
    return new Response("Empty message", { status: 400 });
  }

  // Intent router — regex only, no LLM
  const intent = classifyIntent(lastMessageText);

  if (intent.type === "direct_fetch") {
    return handleDirectFetch(intent.key, supabase, user.id);
  }

  if (intent.type === "direct_action" && intent.action === "log_food") {
    return handleDirectLogAction(intent.description, supabase, user.id);
  }

  // Complex: full Claude agent loop
  const [profile, memoryResult] = await Promise.all([
    getProfile(supabase, user.id),
    supabase
      .from("user_memory")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const memoryCount = memoryResult.count ?? 0;
  const systemPrompt = buildSystemPrompt(profile, memoryCount);
  const tools = buildChatTools(supabase, user.id);

  // convertToModelMessages converts UI messages (parts-based) to ModelMessage[] (content-based)
  const rawModelMessages = await convertToModelMessages(messages.slice(-20));
  // Filter out any messages with empty content that Anthropic would reject
  const modelMessages = rawModelMessages.filter((m) => {
    const c = m.content;
    if (typeof c === "string") return c.trim().length > 0;
    if (Array.isArray(c)) return c.length > 0;
    return false;
  });
  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
