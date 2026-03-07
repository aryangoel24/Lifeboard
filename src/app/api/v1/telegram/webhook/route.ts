import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendMessage,
  answerCallbackQuery,
  downloadTelegramFile,
  buildInlineKeyboard,
} from "@/lib/telegram-utils";
import {
  getUserByChatId,
  linkTelegramAccount,
  findRecipeMatch,
  fetchUserRecipes,
  savePendingSession,
  getPendingSession,
  deletePendingSession,
  getTodaySummary,
} from "@/lib/telegram-bot";
import {
  estimateNutritionFromDescription,
  estimateNutritionFromPhoto,
  analyzeTelegramIntent,
} from "@/lib/ai-utils";
import { uploadBase64Photo } from "@/lib/storage-utils";
import { getDefaultMealCategory } from "@/lib/utils";
import type { MealCategory } from "@/types/database";

// Always return 200 to Telegram regardless of errors
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify secret token
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  console.log("[telegram] incoming secret:", secret?.slice(0, 8), "env secret:", process.env.TELEGRAM_WEBHOOK_SECRET?.slice(0, 8));
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.log("[telegram] secret mismatch, rejecting");
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Handle callback queries (button presses)
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  // Handle messages
  if (update.message) {
    const message = update.message;
    const chatId = String(message.chat.id);

    if (message.text) {
      if (message.text.startsWith("/")) {
        await handleCommand(chatId, message.text).catch(console.error);
      } else {
        await handleTextMessage(chatId, message.text).catch(console.error);
      }
    } else if (message.photo) {
      await handlePhotoMessage(chatId, message.photo).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}

// --- Command handler ---

async function handleCommand(chatId: string, text: string): Promise<void> {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command === "/start") {
    await sendMessage(
      chatId,
      "👋 Welcome to your Lifeboard bot!\n\nTo link your account, run:\n<code>/link YOUR_API_TOKEN</code>\n\nGet your token from the Goals page in the app.",
      { parse_mode: "HTML" }
    );
    return;
  }

  if (command === "/help") {
    await sendMessage(
      chatId,
      "📋 <b>Commands:</b>\n/link &lt;token&gt; — Link your account\n/status — Today's macro totals\n/help — Show this message\n\n<b>Logging food:</b>\nJust send a text description of what you ate, e.g. \"2 scrambled eggs with toast\"\n\nOr send a <b>photo</b> of your food and I'll identify it.",
      { parse_mode: "HTML" }
    );
    return;
  }

  if (command === "/link") {
    const token = parts[1];
    if (!token) {
      await sendMessage(chatId, "❌ Usage: /link YOUR_API_TOKEN\n\nGet your token from the Goals page.");
      return;
    }
    const result = await linkTelegramAccount(token, chatId);
    if (result.success) {
      await sendMessage(chatId, "✅ Linked! Send me a meal to log it.");
    } else {
      await sendMessage(chatId, `❌ ${result.error}`);
    }
    return;
  }

  if (command === "/status") {
    const user = await getUserByChatId(chatId);
    if (!user) {
      await sendMessage(chatId, "❌ Account not linked. Use /link to connect your account.");
      return;
    }
    const summary = await getTodaySummary(user.id);
    if (!summary) {
      await sendMessage(chatId, "❌ Failed to fetch today's data.");
      return;
    }
    const { calories, protein, carbs, fat, goals } = summary;
    const calPct = goals.calories > 0 ? Math.round((calories / goals.calories) * 100) : 0;
    await sendMessage(
      chatId,
      `📊 <b>Today's summary:</b>\n\n🔥 Calories: ${calories} / ${goals.calories} kcal (${calPct}%)\n🥩 Protein: ${protein}g / ${goals.protein}g\n🍞 Carbs: ${carbs}g / ${goals.carbs}g\n🧈 Fat: ${fat}g / ${goals.fat}g`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Unknown command
  await sendMessage(chatId, "Unknown command. Send /help for a list of commands.");
}

// --- Text message handler ---

async function handleTextMessage(chatId: string, text: string): Promise<void> {
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(chatId, "❌ Account not linked. Use /link <token> to connect your account.");
    return;
  }

  // 1. Ask the LLM to classify intent
  const { result: intentResponse, error: intentError } = await analyzeTelegramIntent(text);
  if (intentError || !intentResponse) {
    await sendMessage(chatId, "❌ Failed to understand your message. Please try again.");
    return;
  }

  const { intent, data } = intentResponse;

  // --- KNOWLEDGE INTENT ---
  if (intent === "knowledge") {
    const isUrl = !!data?.url;
    const processingMsg = isUrl ? `🧠 Extracting into Knowledge Hub...\nAnalyzing: ${data.url}` : `🧠 Saving thought to Knowledge Hub...`;

    await sendMessage(chatId, processingMsg);

    // Import dynamically to avoid top-level circular issues if any exist
    const { directIngestKnowledgeToInbox } = await import("@/lib/actions/extract");

    const ingestPayload = isUrl
      ? { kind: "url" as const, url: data.url! }
      : { kind: "text" as const, text };

    const ingestRes = await directIngestKnowledgeToInbox(ingestPayload);

    if (ingestRes && "error" in ingestRes) {
      await sendMessage(chatId, `❌ Failed to save knowledge: ${ingestRes.error}`);
    } else {
      await sendMessage(chatId, `✅ Successfully saved to your Knowledge Inbox!`);
    }
    return;
  }

  // --- EXPENSE INTENT ---
  if (intent === "expense") {
    const amount = data?.amount || 0;
    const merchant = data?.merchant || "Unknown Merchant";

    const sessionId = await savePendingSession(user.id, chatId, {
      source: "expense",
      amount,
      merchant,
      expense_category: data?.expense_category || "other",
      description: data?.description || text,
      // satisfy required types with dummy data since it's an expense source
      name: "", calories: 0, protein: 0, carbs: 0, fat: 0, meal_category: "snack"
    });

    if (!sessionId) {
      await sendMessage(chatId, "❌ Something went wrong preserving the session.");
      return;
    }

    await sendMessage(
      chatId,
      `💸 <b>Log Expense</b>\n\nAmount: $${amount.toFixed(2)}\nMerchant: ${merchant}\nCategory: ${data?.expense_category || "other"}`,
      {
        parse_mode: "HTML",
        reply_markup: buildInlineKeyboard([
          [
            { text: "✅ Log Expense", callback_data: `log_expense:${sessionId}` },
            { text: "❌ Cancel", callback_data: `cancel:${sessionId}` },
          ],
        ]),
      }
    );
    return;
  }

  // --- PANTRY INTENT ---
  if (intent === "pantry") {
    const itemName = data?.pantry_name || "Unknown Item";

    const sessionId = await savePendingSession(user.id, chatId, {
      source: "pantry",
      pantry_name: itemName,
      pantry_category: data?.pantry_category || "other",
      assumed_size: data?.assumed_size || "1 unit",
      // satisfy dummy data
      name: "", calories: 0, protein: 0, carbs: 0, fat: 0, meal_category: "snack"
    });

    if (!sessionId) {
      await sendMessage(chatId, "❌ Something went wrong preserving the session.");
      return;
    }

    await sendMessage(
      chatId,
      `🛒 <b>Add to Pantry</b>\n\nItem: ${itemName}\nCategory: ${data?.pantry_category || "other"}\nSize: ${data?.assumed_size || "1 unit"}`,
      {
        parse_mode: "HTML",
        reply_markup: buildInlineKeyboard([
          [
            { text: "✅ Add to Pantry", callback_data: `log_pantry:${sessionId}` },
            { text: "❌ Cancel", callback_data: `cancel:${sessionId}` },
          ],
        ]),
      }
    );
    return;
  }

  // --- FOOD INTENT (Fallback to existing logic) ---

  // Check recipe match
  const recipes = await fetchUserRecipes(user.id);
  const matchedRecipe = findRecipeMatch(recipes, text);

  if (matchedRecipe) {
    const servings = matchedRecipe.servings || 1;
    const perServing = {
      calories: Math.round(matchedRecipe.total_calories / servings),
      protein: Math.round(matchedRecipe.total_protein / servings * 10) / 10,
      carbs: Math.round(matchedRecipe.total_carbs / servings * 10) / 10,
      fat: Math.round(matchedRecipe.total_fat / servings * 10) / 10,
    };

    const sessionId = await savePendingSession(user.id, chatId, {
      source: "recipe",
      recipe_id: matchedRecipe.id,
      name: matchedRecipe.name,
      calories: perServing.calories,
      protein: perServing.protein,
      carbs: perServing.carbs,
      fat: perServing.fat,
      meal_category: getDefaultMealCategory(new Date().getHours()),
      original_text: text,
    });

    if (!sessionId) {
      await sendMessage(chatId, "❌ Something went wrong. Please try again.");
      return;
    }

    await sendMessage(
      chatId,
      `Is this <b>${matchedRecipe.name}</b> from your recipes? (1 serving)\n📊 ${perServing.calories} cal  |  ${perServing.protein}g protein  |  ${perServing.carbs}g carbs  |  ${perServing.fat}g fat`,
      {
        parse_mode: "HTML",
        reply_markup: buildInlineKeyboard([
          [
            { text: "✅ Yes, log recipe", callback_data: `log_food:${sessionId}` },
            { text: "🤖 No, estimate instead", callback_data: `no_recipe:${sessionId}` },
            { text: "❌ Cancel", callback_data: `cancel:${sessionId}` },
          ],
        ]),
      }
    );
    return;
  }

  // Fall back to AI estimation
  const { data: estimate, error } = await estimateNutritionFromDescription(text);
  if (error || !estimate) {
    await sendMessage(chatId, `❌ Failed to estimate nutrition: ${error || "Unknown error"}`);
    return;
  }

  const sessionId = await savePendingSession(user.id, chatId, {
    source: "ai",
    name: estimate.name,
    calories: estimate.calories,
    protein: estimate.protein,
    carbs: estimate.carbs,
    fat: estimate.fat,
    meal_category: estimate.meal_category,
    original_text: text,
  });

  if (!sessionId) {
    await sendMessage(chatId, "❌ Something went wrong. Please try again.");
    return;
  }

  await sendMessage(
    chatId,
    `🍽 <b>${estimate.name}</b>\n📊 ${estimate.calories} cal  |  ${estimate.protein}g protein  |  ${estimate.carbs}g carbs  |  ${estimate.fat}g fat\n🏷 ${estimate.meal_category}`,
    {
      parse_mode: "HTML",
      reply_markup: buildInlineKeyboard([
        [
          { text: "✅ Log it", callback_data: `log_food:${sessionId}` },
          { text: "❌ Cancel", callback_data: `cancel:${sessionId}` },
        ],
      ]),
    }
  );
}

// --- Photo message handler ---

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

async function handlePhotoMessage(chatId: string, photos: TelegramPhotoSize[]): Promise<void> {
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(chatId, "❌ Account not linked. Use /link <token> to connect your account.");
    return;
  }

  await sendMessage(chatId, "🔍 Analysing your photo…");

  // Use the largest photo size
  const largestPhoto = photos.reduce((a, b) => (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b);

  const base64 = await downloadTelegramFile(largestPhoto.file_id);
  if (!base64) {
    await sendMessage(chatId, "❌ Failed to download photo. Please try again.");
    return;
  }

  // Upload to Supabase Storage
  const uploadResult = await uploadBase64Photo(user.id, base64);
  if ("error" in uploadResult) {
    await sendMessage(chatId, `❌ Failed to upload photo: ${uploadResult.error}`);
    return;
  }

  const { data: estimate, error } = await estimateNutritionFromPhoto(uploadResult.signedUrl);
  if (error || !estimate) {
    await sendMessage(chatId, `❌ Failed to analyse photo: ${error || "Unknown error"}`);
    return;
  }

  const sessionId = await savePendingSession(user.id, chatId, {
    source: "ai",
    name: estimate.name,
    calories: estimate.calories,
    protein: estimate.protein,
    carbs: estimate.carbs,
    fat: estimate.fat,
    meal_category: estimate.meal_category,
    photo_path: uploadResult.photoPath,
  });

  if (!sessionId) {
    await sendMessage(chatId, "❌ Something went wrong. Please try again.");
    return;
  }

  await sendMessage(
    chatId,
    `🍽 <b>${estimate.name}</b>\n📊 ${estimate.calories} cal  |  ${estimate.protein}g protein  |  ${estimate.carbs}g carbs  |  ${estimate.fat}g fat\n🏷 ${estimate.meal_category}`,
    {
      parse_mode: "HTML",
      reply_markup: buildInlineKeyboard([
        [
          { text: "✅ Log it", callback_data: `log_food:${sessionId}` },
          { text: "❌ Cancel", callback_data: `cancel:${sessionId}` },
        ],
      ]),
    }
  );
}

// --- Callback query handler ---

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number } };
  data?: string;
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const callbackData = callbackQuery.data ?? "";
  const chatId = String(callbackQuery.message?.chat.id ?? callbackQuery.from.id);

  if (callbackData.startsWith("log_food:")) {
    const sessionId = callbackData.slice(9);
    const session = await getPendingSession(sessionId);
    if (!session) {
      await answerCallbackQuery(callbackQuery.id, "Session expired.");
      return;
    }

    const { name, calories, protein, carbs, fat, meal_category, photo_path } = session.data;
    const supabase = createAdminClient();
    const { error } = await supabase.from("food_entries").insert({
      user_id: session.user_id,
      name,
      calories,
      protein,
      carbs,
      fat,
      meal_category: meal_category as MealCategory,
      photo_url: photo_path ?? null,
      logged_at: new Date().toISOString(),
    });

    if (error) {
      await answerCallbackQuery(callbackQuery.id, "Failed to log entry.");
      await sendMessage(chatId, "❌ Failed to log entry. Please try again.");
      return;
    }

    await deletePendingSession(sessionId);
    await answerCallbackQuery(callbackQuery.id, "✅ Logged!");
    await sendMessage(
      chatId,
      `✅ Logged <b>${name}</b>\n📊 ${calories} cal  |  ${protein}g protein  |  ${carbs}g carbs  |  ${fat}g fat`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (callbackData.startsWith("log_expense:")) {
    const sessionId = callbackData.slice(12);
    const session = await getPendingSession(sessionId);
    if (!session) {
      await answerCallbackQuery(callbackQuery.id, "Session expired.");
      return;
    }

    const { amount, merchant, expense_category, description } = session.data;
    const supabase = createAdminClient();
    const { error } = await supabase.from("expense_entries").insert({
      user_id: session.user_id,
      amount: amount || 0,
      merchant_name: merchant || null,
      category: expense_category || "other",
      description: description || null,
      expense_date: new Date().toISOString().slice(0, 10),
      source: "manual",
    });

    if (error) {
      await answerCallbackQuery(callbackQuery.id, "Failed to log expense.");
      await sendMessage(chatId, "❌ Failed to log expense. Please try again.");
      return;
    }

    await deletePendingSession(sessionId);
    await answerCallbackQuery(callbackQuery.id, "✅ Expense Logged!");
    await sendMessage(
      chatId,
      `✅ Logged Expense\n💸 $${amount?.toFixed(2)} at ${merchant}`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (callbackData.startsWith("log_pantry:")) {
    const sessionId = callbackData.slice(11);
    const session = await getPendingSession(sessionId);
    if (!session) {
      await answerCallbackQuery(callbackQuery.id, "Session expired.");
      return;
    }

    const { pantry_name, pantry_category, assumed_size } = session.data;
    const supabase = createAdminClient();
    const { error } = await supabase.from("pantry_items").insert({
      user_id: session.user_id,
      name: pantry_name || "Unknown Item",
      category: pantry_category || "pantry",
      base_amount: 1, // AI estimation isn't strict here, just drop it in
      base_unit: assumed_size || "unit",
      calories_per_base: 0,
      protein_per_base: 0,
      carbs_per_base: 0,
      fat_per_base: 0,
    });

    if (error) {
      await answerCallbackQuery(callbackQuery.id, "Failed to add to pantry.");
      await sendMessage(chatId, "❌ Failed to add to pantry. Please try again.");
      return;
    }

    await deletePendingSession(sessionId);
    await answerCallbackQuery(callbackQuery.id, "✅ Added to Pantry!");
    await sendMessage(
      chatId,
      `✅ Added <b>${pantry_name}</b> to your Pantry.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (callbackData.startsWith("no_recipe:")) {
    const sessionId = callbackData.slice(10);
    const session = await getPendingSession(sessionId);
    if (!session) {
      await answerCallbackQuery(callbackQuery.id, "Session expired.");
      return;
    }

    const originalText = session.data.original_text;
    if (!originalText) {
      await answerCallbackQuery(callbackQuery.id, "Session data missing.");
      return;
    }

    await deletePendingSession(sessionId);
    await answerCallbackQuery(callbackQuery.id);

    const { data: estimate, error } = await estimateNutritionFromDescription(originalText);
    if (error || !estimate) {
      await sendMessage(chatId, `❌ Failed to estimate nutrition: ${error || "Unknown error"}`);
      return;
    }

    const newSessionId = await savePendingSession(session.user_id, chatId, {
      source: "ai",
      name: estimate.name,
      calories: estimate.calories,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat,
      meal_category: estimate.meal_category,
      original_text: originalText,
    });

    if (!newSessionId) {
      await sendMessage(chatId, "❌ Something went wrong. Please try again.");
      return;
    }

    await sendMessage(
      chatId,
      `🍽 <b>${estimate.name}</b>\n📊 ${estimate.calories} cal  |  ${estimate.protein}g protein  |  ${estimate.carbs}g carbs  |  ${estimate.fat}g fat\n🏷 ${estimate.meal_category}`,
      {
        parse_mode: "HTML",
        reply_markup: buildInlineKeyboard([
          [
            { text: "✅ Log it", callback_data: `log_food:${newSessionId}` },
            { text: "❌ Cancel", callback_data: `cancel:${newSessionId}` },
          ],
        ]),
      }
    );
    return;
  }

  if (callbackData.startsWith("cancel:")) {
    const sessionId = callbackData.slice(7);
    await deletePendingSession(sessionId);
    await answerCallbackQuery(callbackQuery.id, "Cancelled.");
    return;
  }

  await answerCallbackQuery(callbackQuery.id);
}

// --- Telegram update types ---

interface TelegramMessage {
  chat: { id: number };
  text?: string;
  photo?: TelegramPhotoSize[];
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
