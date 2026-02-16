import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { uploadBase64Photo } from "@/lib/storage-utils";
import { extractNutritionFromLabelImage } from "@/lib/ai-utils";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: { photo?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  if (!body.photo) {
    return apiError("INVALID_INPUT", "photo (base64) is required", 400);
  }

  const uploadResult = await uploadBase64Photo(auth.userId, body.photo);
  if ("error" in uploadResult) {
    const code = uploadResult.error.includes("maximum size")
      ? "PHOTO_TOO_LARGE"
      : "INTERNAL_ERROR";
    return apiError(code, uploadResult.error, code === "PHOTO_TOO_LARGE" ? 413 : 500);
  }

  const aiResult = await extractNutritionFromLabelImage(uploadResult.signedUrl);
  if (aiResult.error || !aiResult.data) {
    return apiError("AI_FAILED", aiResult.error || "Label extraction failed", 500);
  }

  return apiSuccess({
    ...aiResult.data,
    photo_path: uploadResult.photoPath,
  });
}
