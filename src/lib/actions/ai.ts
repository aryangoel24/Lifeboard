"use server";

import {
  estimateNutritionFromDescription,
  extractNutritionFromLabelImage,
} from "@/lib/ai-utils";

export type { NutritionEstimate, NutritionLabelData } from "@/lib/ai-utils";

export async function estimateNutrition(description: string) {
  return estimateNutritionFromDescription(description);
}

export async function extractNutritionFromLabel(imageUrl: string) {
  return extractNutritionFromLabelImage(imageUrl);
}
