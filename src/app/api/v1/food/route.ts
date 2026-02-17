import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNow } from "@/lib/timezone";
import type { MealCategory, MealSource } from "@/types/database";

const VALID_CATEGORIES: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: {
    name?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    meal_category?: string;
    photo_path?: string;
    cost?: number;
    meal_source?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  const { name, calories, protein, carbs, fat, meal_category, photo_path, cost, meal_source } =
    body;

  if (!name || calories == null || protein == null || carbs == null || fat == null) {
    return apiError(
      "INVALID_INPUT",
      "name, calories, protein, carbs, and fat are required",
      400
    );
  }

  if (meal_category && !VALID_CATEGORIES.includes(meal_category as MealCategory)) {
    return apiError(
      "INVALID_INPUT",
      `meal_category must be one of: ${VALID_CATEGORIES.join(", ")}`,
      400
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("food_entries")
    .insert({
      user_id: auth.userId,
      name,
      calories,
      protein,
      carbs,
      fat,
      meal_category: (meal_category as MealCategory) || "snack",
      photo_url: photo_path || null,
      cost: cost || null,
      meal_source: (meal_source as MealSource) || null,
      logged_at: getNow().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Food entry error:", error);
    return apiError("INTERNAL_ERROR", "Failed to create food entry", 500);
  }

  return apiSuccess({ id: data.id }, 201);
}
