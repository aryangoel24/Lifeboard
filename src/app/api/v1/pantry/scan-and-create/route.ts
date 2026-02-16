import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { uploadBase64Photo } from "@/lib/storage-utils";
import { extractNutritionFromLabelImage } from "@/lib/ai-utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: { photo?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  if (!body.photo) {
    return apiError("INVALID_INPUT", "photo (base64) is required", 400);
  }

  // Upload photo
  const uploadResult = await uploadBase64Photo(auth.userId, body.photo);
  if ("error" in uploadResult) {
    const code = uploadResult.error.includes("maximum size")
      ? "PHOTO_TOO_LARGE"
      : "INTERNAL_ERROR";
    return apiError(code, uploadResult.error, code === "PHOTO_TOO_LARGE" ? 413 : 500);
  }

  // AI extract nutrition from label
  const aiResult = await extractNutritionFromLabelImage(uploadResult.signedUrl);
  if (aiResult.error || !aiResult.data) {
    return apiError("AI_FAILED", aiResult.error || "Label extraction failed", 500);
  }

  const label = aiResult.data;

  // Create pantry item
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .insert({
      user_id: auth.userId,
      name: label.name,
      category: body.category || "other",
      base_amount: label.serving_amount,
      base_unit: label.serving_unit,
      calories_per_base: label.calories,
      protein_per_base: label.protein,
      carbs_per_base: label.carbs,
      fat_per_base: label.fat,
      photo_url: uploadResult.photoPath,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Pantry item error:", error);
    return apiError("INTERNAL_ERROR", "Failed to create pantry item", 500);
  }

  return apiSuccess({
    id: data.id,
    name: label.name,
    serving_amount: label.serving_amount,
    serving_unit: label.serving_unit,
    calories: label.calories,
    protein: label.protein,
    carbs: label.carbs,
    fat: label.fat,
  }, 201);
}
