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

export interface NutritionLabelData {
    name: string;
    serving_amount: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export async function extractNutritionFromLabel(
    imageUrl: string
): Promise<{ data: NutritionLabelData | null; error: string | null }> {
    if (!imageUrl) {
        return { data: null, error: "No image provided" };
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

        // Validate required fields
        if (
            typeof parsed.calories !== "number" ||
            typeof parsed.protein !== "number" ||
            typeof parsed.carbs !== "number" ||
            typeof parsed.fat !== "number"
        ) {
            return { data: null, error: "AI returned invalid data" };
        }

        // Clamp values
        parsed.calories = Math.max(0, Math.round(parsed.calories));
        parsed.protein = Math.max(0, Math.round(parsed.protein * 10) / 10);
        parsed.carbs = Math.max(0, Math.round(parsed.carbs * 10) / 10);
        parsed.fat = Math.max(0, Math.round(parsed.fat * 10) / 10);
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
