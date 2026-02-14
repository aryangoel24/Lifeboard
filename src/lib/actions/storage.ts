"use server";

import { createClient } from "@/lib/supabase/server";

export async function deletePhoto(photoUrl: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Extract path from URL: {user_id}/{filename}
  const path = photoUrl.split("/food-photos/").pop();
  if (!path) {
    return { error: "Invalid photo URL" };
  }

  const { error } = await supabase.storage.from("food-photos").remove([path]);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
