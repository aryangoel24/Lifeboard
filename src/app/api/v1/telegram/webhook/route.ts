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
      "👋 Welcome to your Food Tracker bot!\n\nTo link your account, run:\n<code>/link YOUR_API_TOKEN</code>\n\nGet your token from the Goals page in the app.",
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

  // Check recipe match
  const recipes = await fetchUserRecipes(user.id);
  const matchedRecipe = findRecipeMatch(recipes, text);

  if (matchedRecipe) {
    const sessionId = await savePendingSession(user.id, chatId, {
      source: "recipe",
      recipe_id: matchedRecipe.id,
      name: matchedRecipe.name,
      calories: matchedRecipe.total_calories,
      protein: matchedRecipe.total_protein,
      carbs: matchedRecipe.total_carbs,
      fat: matchedRecipe.total_fat,
      meal_category: getDefaultMealCategory(),
      original_text: text,
    });

    if (!sessionId) {
      await sendMessage(chatId, "❌ Something went wrong. Please try again.");
      return;
    }

    await sendMessage(
      chatId,
      `Is this <b>${matchedRecipe.name}</b> from your recipes?\n📊 ${matchedRecipe.total_calories} cal  |  ${matchedRecipe.total_protein}g protein  |  ${matchedRecipe.total_carbs}g carbs  |  ${matchedRecipe.total_fat}g fat`,
      {
        parse_mode: "HTML",
        reply_markup: buildInlineKeyboard([
          [
            { text: "✅ Yes, log recipe", callback_data: `log:${sessionId}` },
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
          { text: "✅ Log it", callback_data: `log:${sessionId}` },
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
          { text: "✅ Log it", callback_data: `log:${sessionId}` },
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

  if (callbackData.startsWith("log:")) {
    const sessionId = callbackData.slice(4);
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
            { text: "✅ Log it", callback_data: `log:${newSessionId}` },
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
