import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

interface UploadSuccess {
  photoPath: string;
  signedUrl: string;
}

interface UploadError {
  error: string;
}

export async function uploadBase64Photo(
  userId: string,
  base64Data: string,
  bucket: string = "food-photos"
): Promise<UploadSuccess | UploadError> {
  // Strip data URL prefix if present
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Clean, "base64");
  } catch {
    return { error: "Invalid base64 data" };
  }

  if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
    return {
      error: `Photo exceeds maximum size of ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB`,
    };
  }

  const photoPath = `${userId}/${randomUUID()}.jpg`;
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(photoPath, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    console.error("Photo upload error:", error);
    return { error: "Failed to upload photo" };
  }

  const signedUrlResult = await getSignedUrl(photoPath, bucket);
  if ("error" in signedUrlResult) {
    return signedUrlResult;
  }

  return { photoPath, signedUrl: signedUrlResult.signedUrl };
}

export async function getSignedUrl(
  photoPath: string,
  bucket: string = "food-photos"
): Promise<{ signedUrl: string } | { error: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(photoPath, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    console.error("Signed URL error:", error);
    return { error: "Failed to generate signed URL" };
  }

  return { signedUrl: data.signedUrl };
}
