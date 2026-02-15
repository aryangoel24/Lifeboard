"use server";

import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a food description, estimate the nutritional content.

Rules:
- Return a JSON object with these exact fields: name, calories, protein, carbs, fat, meal_category
- "name" should be a clean, capitalized food name (e.g. "Grilled Chicken with Rice and Broccoli")
- "calories" is a number (kcal)
- "protein", "carbs", "fat" are numbers in grams, rounded to 1 decimal
- "meal_category" must be one of: "breakfast", "lunch", "dinner", "snack" — infer from the food or time context
- If multiple items are described, combine them into one entry with summed macros
- Be reasonably accurate but err on the side of slightly overestimating calories
- Only return the JSON object, no other text`;

interface NutritionEstimate {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meal_category: "breakfast" | "lunch" | "dinner" | "snack";
}

export async function estimateNutrition(
    description: string
): Promise<{ data: NutritionEstimate | null; error: string | null }> {
    if (!description.trim()) {
        return { data: null, error: "Please describe what you ate" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return {
            data: null,
            error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local",
        };
    }

    try {
        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
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

        // Validate required fields
        if (
            typeof parsed.calories !== "number" ||
            typeof parsed.protein !== "number" ||
            typeof parsed.carbs !== "number" ||
            typeof parsed.fat !== "number"
        ) {
            return { data: null, error: "AI returned invalid data" };
        }

        // Clamp values to reasonable ranges
        parsed.calories = Math.max(0, Math.round(parsed.calories));
        parsed.protein = Math.max(0, Math.round(parsed.protein * 10) / 10);
        parsed.carbs = Math.max(0, Math.round(parsed.carbs * 10) / 10);
        parsed.fat = Math.max(0, Math.round(parsed.fat * 10) / 10);

        // Validate meal_category
        const validCategories = ["breakfast", "lunch", "dinner", "snack"];
        if (!validCategories.includes(parsed.meal_category)) {
            parsed.meal_category = "snack";
        }

        return { data: parsed, error: null };
    } catch (err) {
        console.error("AI estimation error:", err);
        return {
            data: null,
            error: "Failed to estimate nutrition. You can still enter values manually.",
        };
    }
}
