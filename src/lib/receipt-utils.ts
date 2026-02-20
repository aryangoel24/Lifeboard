import OpenAI from "openai";

const RECEIPT_SYSTEM_PROMPT = `You are a receipt parser. Given the text of a grocery receipt email, extract the final total amount charged to the customer.

Rules:
- Return a JSON object with this exact field: { "total": <number> }
- "total" is the final amount charged (after tax, after discounts) — not a subtotal, not a tax line
- Return the number as a float (e.g. 47.32)
- If you cannot find a clear total, return { "total": null }
- Only return the JSON object, no other text`;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function extractTotalFromReceipt(emailBody: string): Promise<number | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: RECEIPT_SYSTEM_PROMPT },
        { role: "user", content: emailBody },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 50,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { total: number | null };
    if (typeof parsed.total !== "number" || isNaN(parsed.total) || parsed.total <= 0) {
      return null;
    }

    return Math.round(parsed.total * 100) / 100;
  } catch (err) {
    console.error("Receipt extraction error:", err);
    return null;
  }
}
