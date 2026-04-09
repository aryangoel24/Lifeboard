import { getOpenAIClient, MODELS } from "@/lib/openai";

const SPENDING_CATEGORIES = [
  { id: "groceries", label: "Groceries" },
  { id: "restaurants", label: "Restaurants & Delivery" },
  { id: "alcohol", label: "Alcohol" },
  { id: "clothing", label: "Clothing & Shopping" },
  { id: "entertainment", label: "Entertainment" },
  { id: "investing", label: "Investing" },
  { id: "other", label: "Other" },
];

const CATEGORY_IDS = SPENDING_CATEGORIES.map((c) => c.id).join(", ");

const RECEIPT_SYSTEM_PROMPT = `You are a receipt parser. Given the text of a receipt or purchase email, extract the following:
1. The final total amount charged (after tax, after discounts — not a subtotal)
2. The merchant/store name
3. The most appropriate spending category from this list: ${CATEGORY_IDS}

Rules:
- Return a JSON object with exactly these fields: { "total": <number|null>, "merchant_name": <string|null>, "category": <string|null> }
- "total" is the final amount as a float (e.g. 47.32), or null if not found
- "merchant_name" is the store/restaurant/service name, or null if not found
- "category" must be one of the listed category IDs, or null if unclear
- Only return the JSON object, no other text`;

export interface ReceiptDetails {
  amount: number | null;
  merchant_name: string | null;
  category: string | null;
}

export async function extractReceiptDetails(
  emailBody: string,
  merchantHint?: string | null,
  categoryOverride?: string | null
): Promise<ReceiptDetails> {
  const openai = getOpenAIClient();
  if (!openai) return { amount: null, merchant_name: merchantHint || null, category: categoryOverride || null };

  const prompt = merchantHint
    ? `Sender/merchant hint: ${merchantHint}\n\n${emailBody}`
    : emailBody;

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.gpt4oMini,
      messages: [
        { role: "system", content: RECEIPT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { amount: null, merchant_name: merchantHint || null, category: categoryOverride || null };

    const parsed = JSON.parse(content) as {
      total: number | null;
      merchant_name: string | null;
      category: string | null;
    };

    const amount =
      typeof parsed.total === "number" && !isNaN(parsed.total) && parsed.total > 0
        ? Math.round(parsed.total * 100) / 100
        : null;

    const validCategoryIds = SPENDING_CATEGORIES.map((c) => c.id);
    const category =
      categoryOverride ||
      (parsed.category && validCategoryIds.includes(parsed.category) ? parsed.category : null);

    return {
      amount,
      merchant_name: parsed.merchant_name || merchantHint || null,
      category,
    };
  } catch (err) {
    console.error("Receipt extraction error:", err);
    return { amount: null, merchant_name: merchantHint || null, category: categoryOverride || null };
  }
}

export async function extractTotalFromReceipt(emailBody: string): Promise<number | null> {
  const details = await extractReceiptDetails(emailBody);
  return details.amount;
}
