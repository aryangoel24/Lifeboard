"use server";

import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function generateApiToken(): Promise<{
  token?: string;
  error?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase
    .from("profiles")
    .update({ api_token_hash: tokenHash, api_enabled: true })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  return { token };
}

export async function regenerateApiToken(): Promise<{
  token?: string;
  error?: string;
}> {
  return generateApiToken();
}

export async function toggleApiAccess(
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ api_enabled: enabled })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  return {};
}
