import OpenAI from "openai";
import crypto from "crypto";
import type { KnowledgeNode } from "@/types/database";

const NUTRITION_SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a food description, estimate the nutritional content.

Rules:
- Return a JSON object with these exact fields: name, calories, protein, carbs, fat, meal_category
- "name" should be a clean, capitalized food name (e.g. "Grilled Chicken with Rice and Broccoli")
- "calories" is a number (kcal)
- "protein", "carbs", "fat" are numbers in grams, rounded to 1 decimal
- "meal_category" must be one of: "breakfast", "lunch", "dinner", "snack" — infer from the food or time context
- If multiple items are described, combine them into one entry with summed macros
- Be reasonably accurate but err on the side of slightly overestimating calories
- Only return the JSON object, no other text`;

const PHOTO_SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a photo of food, identify what it is and estimate the nutritional content.

Rules:
- Return a JSON object with these exact fields: name, calories, protein, carbs, fat, meal_category
- "name" should be a clean, capitalized food name (e.g. "Grilled Chicken with Rice and Broccoli")
- "calories" is a number (kcal)
- "protein", "carbs", "fat" are numbers in grams, rounded to 1 decimal
- "meal_category" must be one of: "breakfast", "lunch", "dinner", "snack" — infer from the food type
- Estimate portion sizes from the photo and calculate macros accordingly
- Be reasonably accurate but err on the side of slightly overestimating calories
- Only return the JSON object, no other text`;

const LABEL_SYSTEM_PROMPT = `You are a nutrition label reader. Given an image of a nutrition label, extract the nutritional information.

Rules:
- Return a JSON object with these exact fields: name, serving_amount, serving_unit, calories, protein, carbs, fat
- "name" should be the product name if visible, otherwise a reasonable description
- "serving_amount" is the numeric serving size (e.g. 100, 28, 240)
- "serving_unit" is the unit (e.g. "g", "ml", "oz")
- "calories" is a number (kcal per serving)
- "protein", "carbs", "fat" are numbers in grams per serving, rounded to 1 decimal
- If you cannot read certain values, use 0
- Only return the JSON object, no other text`;

export interface NutritionEstimate {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_category: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface NutritionLabelData {
  name: string;
  serving_amount: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function clampNutrition<T extends { calories: number; protein: number; carbs: number; fat: number }>(
  parsed: T
): T {
  parsed.calories = Math.max(0, Math.round(parsed.calories));
  parsed.protein = Math.max(0, Math.round(parsed.protein * 10) / 10);
  parsed.carbs = Math.max(0, Math.round(parsed.carbs * 10) / 10);
  parsed.fat = Math.max(0, Math.round(parsed.fat * 10) / 10);
  return parsed;
}

function validateMealCategory(category: string): NutritionEstimate["meal_category"] {
  const valid = ["breakfast", "lunch", "dinner", "snack"];
  return valid.includes(category) ? (category as NutritionEstimate["meal_category"]) : "snack";
}

export async function estimateNutritionFromDescription(
  description: string
): Promise<{ data: NutritionEstimate | null; error: string | null }> {
  if (!description.trim()) {
    return { data: null, error: "Please describe what you ate" };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return {
      data: null,
      error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local",
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: NUTRITION_SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { data: null, error: "No response from AI" };
    }

    const parsed = JSON.parse(content) as NutritionEstimate;

    if (
      typeof parsed.calories !== "number" ||
      typeof parsed.protein !== "number" ||
      typeof parsed.carbs !== "number" ||
      typeof parsed.fat !== "number"
    ) {
      return { data: null, error: "AI returned invalid data" };
    }

    clampNutrition(parsed);
    parsed.meal_category = validateMealCategory(parsed.meal_category);

    return { data: parsed, error: null };
  } catch (err) {
    console.error("AI estimation error:", err);
    return {
      data: null,
      error: "Failed to estimate nutrition. You can still enter values manually.",
    };
  }
}

export async function estimateNutritionFromPhoto(
  imageUrl: string
): Promise<{ data: NutritionEstimate | null; error: string | null }> {
  if (!imageUrl) {
    return { data: null, error: "No image provided" };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return {
      data: null,
      error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local",
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: PHOTO_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
            {
              type: "text",
              text: "Identify this food and estimate its nutritional content.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { data: null, error: "No response from AI" };
    }

    const parsed = JSON.parse(content) as NutritionEstimate;

    if (
      typeof parsed.calories !== "number" ||
      typeof parsed.protein !== "number" ||
      typeof parsed.carbs !== "number" ||
      typeof parsed.fat !== "number"
    ) {
      return { data: null, error: "AI returned invalid data" };
    }

    clampNutrition(parsed);
    parsed.meal_category = validateMealCategory(parsed.meal_category);

    return { data: parsed, error: null };
  } catch (err) {
    console.error("AI photo estimation error:", err);
    return {
      data: null,
      error: "Failed to estimate nutrition from photo.",
    };
  }
}

export async function suggestHabitIcon(
  name: string
): Promise<{ icon: string | null; error: string | null }> {
  const openai = getOpenAIClient();
  if (!openai) return { icon: null, error: "OpenAI not configured" };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an emoji picker. Given a habit name, respond with exactly one emoji that best represents it. Output only the single emoji, nothing else.",
        },
        { role: "user", content: name },
      ],
      temperature: 0.7,
      max_tokens: 10,
    });
    const emoji = response.choices[0]?.message?.content?.trim() || null;
    return { icon: emoji, error: null };
  } catch (err) {
    console.error("Habit icon generation error:", err);
    return { icon: null, error: "Failed to generate icon" };
  }
}

export async function extractNutritionFromLabelImage(
  imageUrl: string
): Promise<{ data: NutritionLabelData | null; error: string | null }> {
  if (!imageUrl) {
    return { data: null, error: "No image provided" };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return {
      data: null,
      error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local",
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: LABEL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
            {
              type: "text",
              text: "Extract the nutrition information from this label.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { data: null, error: "No response from AI" };
    }

    const parsed = JSON.parse(content) as NutritionLabelData;

    if (
      typeof parsed.calories !== "number" ||
      typeof parsed.protein !== "number" ||
      typeof parsed.carbs !== "number" ||
      typeof parsed.fat !== "number"
    ) {
      return { data: null, error: "AI returned invalid data" };
    }

    clampNutrition(parsed);
    parsed.serving_amount = Math.max(0, parsed.serving_amount || 100);
    parsed.serving_unit = parsed.serving_unit || "g";

    return { data: parsed, error: null };
  } catch (err) {
    console.error("Label extraction error:", err);
    return {
      data: null,
      error: "Failed to extract nutrition from label. Please enter values manually.",
    };
  }
}

// ------------------------------------------------------------------
// RAG & Semantic Search Utilities
// ------------------------------------------------------------------

/**
 * Generates a 1536-dimensional embedding map for any text using text-embedding-3-small
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[] | null; error: string | null }> {
  const openai = getOpenAIClient();
  if (!openai) {
    return { embedding: null, error: "OpenAI API key not configured." };
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) return { embedding: null, error: "No embedding returned" };

    return { embedding, error: null };
  } catch (err) {
    console.error("Embedding generation error:", err);
    return { embedding: null, error: "Failed to generate embedding" };
  }
}

/**
 * Securely hashes a string to avoid repeating expensive OpenAI embedding calls
 */
export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const RAG_SYNTHESIS_PROMPT = `You are a precision knowledge retrieval assistant. Your job is to answer the user's question using ONLY the provided context nodes.

Strict Constraints:
1. ONLY use information present in the Context given. Do NOT hallucinate or invent facts.
2. If the Context contains the answer (even if it is just a mathematical formula, code snippet, or a terse technical note), provide it and explain it simply if you can.
3. Only if the Context is completely irrelevant to the question should you explicitly say: "I couldn't find information about this in your graph."
4. Cite your sources clearly by mentioning the node title (e.g., "According to [Node Title]...").
5. Be concise, direct, and helpful. Format your answer in markdown for readability.`;

/**
 * Synthesizes a natural language answer based exclusively on retrieved nodes.
 */
export async function synthesizeRagResponse(
  query: string,
  contextNodes: Partial<KnowledgeNode>[]
): Promise<{ text: string | null; error: string | null }> {
  const openai = getOpenAIClient();
  if (!openai) {
    return { text: null, error: "OpenAI API key not configured." };
  }

  if (contextNodes.length === 0) {
    return { text: "I couldn't find any relevant information in your knowledge graph.", error: null };
  }

  // Build the strict structured context block from the nodes
  const contextString = contextNodes
    .map(
      (n, i) =>
        `--- Node ${i + 1} ---\nTitle: ${n.title}\nType: ${n.node_type}\nPath: Parent(${n.parent_id || 'Root'}) -> Root(${n.root_id})\nDescription: ${n.description || "None"}\nKey Facts:\n${Array.isArray(n.key_facts) ? n.key_facts.slice(0, 10).map((f: unknown) => "- " + String(f)).join("\n") : "None"
        }\nUser Facts:\n${Array.isArray(n.user_facts) ? n.user_facts.slice(0, 10).map((f: unknown) => "- " + String(f)).join("\n") : "None"
        }\nEvidence: ${n.ai_evidence ? n.ai_evidence.substring(0, 500) + '...' : "None"}`
    )
    .join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: RAG_SYNTHESIS_PROMPT },
        {
          role: "user",
          content: `Question: ${query}\n\n=== CONTEXT NODES ===\n${contextString}`,
        },
      ],
      temperature: 0.1, // Keep it highly deterministic and grounded
      max_tokens: 1000,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return { text: null, error: "Failed to generate a synthesis." };
    }

    return { text, error: null };
  } catch (err) {
    console.error("RAG Synthesis error:", err);
    return { text: null, error: "Failed to synthesize an answer." };
  }
}

export interface TelegramIntentAnalysis {
  intent: "food" | "expense" | "pantry" | "knowledge" | "unknown";
  data?: {
    // For expense
    amount?: number;
    merchant?: string;
    expense_category?: string; // e.g. "groceries", "dining", "entertainment"
    description?: string;
    // For pantry
    pantry_name?: string;
    pantry_category?: string; // e.g. "produce", "dairy", "pantry"
    assumed_size?: string;
    // For knowledge
    url?: string;
  };
}

const TELEGRAM_ROUTER_PROMPT = `You are a smart triage assistant for a personal Lifeboard application.
The user will send you a short text message, often typed quickly on the go.
Your job is to determine the intent and extract relevant structured data.

Valid intents:
1. "food": The user is describing something they just ate or a meal (e.g., "I just had a slice of pizza", "2 eggs and toast").
2. "expense": The user is logging a purchase or money spent (e.g., "Spent $15 at Starbucks", "Bought groceries for 40.50").
3. "pantry": The user is noting an item they ran out of or need to buy (e.g., "We are out of milk", "Add eggs to the shopping list").
4. "knowledge": The user is saving an article, thought, or extraction, usually comprising a URL or a long informative note (e.g., "Read this: https://example.com/ai-article").
5. "unknown": If it's just a greeting, a random string, or something completely unrelated to the above categories.

Output strictly in JSON format.
Example Expense:
{
  "intent": "expense",
  "data": {
    "amount": 15.00,
    "merchant": "Starbucks",
    "expense_category": "dining",
    "description": "Morning coffee"
  }
}

Example Pantry:
{
  "intent": "pantry",
  "data": {
    "pantry_name": "Milk",
    "pantry_category": "dairy",
    "assumed_size": "1 gallon"
  }
}

Example Knowledge:
{
  "intent": "knowledge",
  "data": {
    "url": "https://example.com/article"
  }
}

Example Food:
{
  "intent": "food"
}
`;

export async function analyzeTelegramIntent(
  text: string
): Promise<{ result: TelegramIntentAnalysis | null; error: string | null }> {
  const openai = getOpenAIClient();
  if (!openai) {
    return { result: null, error: "OpenAI API key not configured." };
  }

  // Fast-path: if text strictly contains ONLY a URL, assume knowledge
  const urlRegex = /^(https?:\/\/[^\s]+)$/i;
  if (urlRegex.test(text.trim())) {
    return {
      result: { intent: "knowledge", data: { url: text.trim() } },
      error: null,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TELEGRAM_ROUTER_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0.2, // Low temp for reliable classification
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { result: null, error: "Failed to parse intent." };
    }

    const parsed = JSON.parse(content) as TelegramIntentAnalysis;
    return { result: parsed, error: null };
  } catch (err) {
    console.error("Error parsing Telegram intent:", err);
    return { result: null, error: "Failed to analyze message content." };
  }
}
