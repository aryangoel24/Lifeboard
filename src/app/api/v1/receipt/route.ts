import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/timezone";
import { extractTotalFromReceipt } from "@/lib/receipt-utils";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (isAuthError(auth)) {
    const code = auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
    return apiError(code, auth.error, auth.status);
  }

  let body: {
    email_body?: string;
    description?: string;
    date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  const { email_body, description, date } = body;

  if (!email_body || !email_body.trim()) {
    return apiError("INVALID_INPUT", "email_body is required", 400);
  }

  const amount = await extractTotalFromReceipt(email_body);
  if (amount === null) {
    return apiError("AI_FAILED", "Could not extract total from receipt", 422);
  }

  const expenseDate = date || getToday();

  const supabase = createAdminClient();
  const { error } = await supabase.from("expense_entries").insert({
    user_id: auth.userId,
    amount,
    description: description || null,
    expense_date: expenseDate,
    source: "receipt",
    raw_text: email_body,
  });

  if (error) {
    console.error("Expense entry error:", error);
    return apiError("INTERNAL_ERROR", "Failed to save expense entry", 500);
  }

  return apiSuccess({ amount, date: expenseDate }, 201);
}
