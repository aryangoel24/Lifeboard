import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateHabitStreak } from "@/lib/actions/habits";
import type { HabitType } from "@/types/database";

const VALID_HABIT_TYPES: HabitType[] = ["creatine", "magnesium", "gym"];

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: { habit_type?: string; value?: number; date?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  const { habit_type, value = 1, date } = body;

  if (!habit_type || !VALID_HABIT_TYPES.includes(habit_type as HabitType)) {
    return apiError(
      "INVALID_INPUT",
      `habit_type must be one of: ${VALID_HABIT_TYPES.join(", ")}`,
      400
    );
  }

  const loggedAt = date || new Date().toISOString().split("T")[0];

  const supabase = createAdminClient();

  const { error } = await supabase.from("habit_entries").upsert(
    {
      user_id: auth.userId,
      habit_type,
      logged_at: loggedAt,
      value,
    },
    { onConflict: "user_id,habit_type,logged_at" }
  );

  if (error) {
    console.error("Habit log error:", error);
    return apiError("INTERNAL_ERROR", "Failed to log habit", 500);
  }

  await updateHabitStreak(auth.userId, habit_type as HabitType, loggedAt, value, supabase);

  return apiSuccess({ habit_type, value, date: loggedAt });
}
