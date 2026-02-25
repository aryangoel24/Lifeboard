import { NextRequest } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/timezone";
import { extractReceiptDetails } from "@/lib/receipt-utils";

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
    category?: string;
    merchant_hint?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_INPUT", "Invalid JSON body", 400);
  }

  const { email_body, description, date, category, merchant_hint } = body;

  if (!email_body || !email_body.trim()) {
    return apiError("INVALID_INPUT", "email_body is required", 400);
  }

  const details = await extractReceiptDetails(email_body, merchant_hint, category);
  if (details.amount === null) {
    return apiError("AI_FAILED", "Could not extract total from receipt", 422);
  }

  const expenseDate = date || getToday();

  const supabase = createAdminClient();
  const { error } = await supabase.from("expense_entries").insert({
    user_id: auth.userId,
    amount: details.amount,
    description: description || null,
    expense_date: expenseDate,
    source: "receipt",
    raw_text: email_body,
    merchant_name: details.merchant_name,
    category: details.category,
  });

  if (error) {
    console.error("Expense entry error:", error);
    return apiError("INTERNAL_ERROR", "Failed to save expense entry", 500);
  }

  return apiSuccess(
    { amount: details.amount, merchant_name: details.merchant_name, category: details.category, date: expenseDate },
    201
  );
}
