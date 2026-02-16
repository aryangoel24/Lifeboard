import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

interface AuthSuccess {
  userId: string;
}

interface AuthError {
  error: string;
  status: number;
}

export async function authenticateApiRequest(
  request: Request
): Promise<AuthSuccess | AuthError> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const token = authHeader.slice(7);
  if (!token) {
    return { error: "Empty token", status: 401 };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const supabase = createAdminClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, api_enabled")
    .eq("api_token_hash", tokenHash)
    .single();

  if (error || !profile) {
    return { error: "Invalid API token", status: 401 };
  }

  if (!profile.api_enabled) {
    return { error: "API access is disabled", status: 403 };
  }

  return { userId: profile.id };
}

export function isAuthError(
  result: AuthSuccess | AuthError
): result is AuthError {
  return "error" in result;
}
