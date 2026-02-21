const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export function buildInlineKeyboard(rows: InlineKeyboardButton[][]): object {
  return {
    inline_keyboard: rows,
  };
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_markup?: object;
  }
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN is not set");
    return;
  }
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...options,
    }),
  });
  if (!res.ok) {
    console.error("[telegram] sendMessage failed:", res.status, await res.text());
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

export async function downloadTelegramFile(fileId: string): Promise<string | null> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };

  if (!fileData.ok || !fileData.result?.file_path) {
    console.error("Failed to get file path from Telegram");
    return null;
  }

  const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const imgRes = await fetch(downloadUrl);

  if (!imgRes.ok) {
    console.error("Failed to download file from Telegram");
    return null;
  }

  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
