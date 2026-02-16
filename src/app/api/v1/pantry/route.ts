import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PantryCategory } from "@/types/database";

const VALID_CATEGORIES: PantryCategory[] = [
  "protein", "dairy", "grain", "vegetable", "fruit", "fat_oil", "spice", "beverage", "other",
];

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: {
    name?: string;
    category?: string;
    base_amount?: number;
    base_unit?: string;
    calories_per_base?: number;
    protein_per_base?: number;
    carbs_per_base?: number;
    fat_per_base?: number;
    cost_per_base?: number;
    photo_path?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  const {
    name,
    category,
    base_amount,
    base_unit,
    calories_per_base,
    protein_per_base,
    carbs_per_base,
    fat_per_base,
    cost_per_base,
    photo_path,
  } = body;

  if (
    !name ||
    !category ||
    base_amount == null ||
    !base_unit ||
    calories_per_base == null ||
    protein_per_base == null ||
    carbs_per_base == null ||
    fat_per_base == null
  ) {
    return apiError(
      "INVALID_INPUT",
      "name, category, base_amount, base_unit, calories_per_base, protein_per_base, carbs_per_base, and fat_per_base are required",
      400
    );
  }

  if (!VALID_CATEGORIES.includes(category as PantryCategory)) {
    return apiError(
      "INVALID_INPUT",
      `category must be one of: ${VALID_CATEGORIES.join(", ")}`,
      400
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pantry_items")
    .insert({
      user_id: auth.userId,
      name,
      category,
      base_amount,
      base_unit,
      calories_per_base,
      protein_per_base,
      carbs_per_base,
      fat_per_base,
      cost_per_base: cost_per_base || null,
      photo_url: photo_path || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Pantry item error:", error);
    return apiError("INTERNAL_ERROR", "Failed to create pantry item", 500);
  }

  return apiSuccess({ id: data.id }, 201);
}
