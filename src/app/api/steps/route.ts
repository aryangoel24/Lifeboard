import { NextResponse } from "next/server";
import { authenticateApiRequest, isAuthError } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/timezone";

export async function POST(request: Request) {
    try {
        const authResult = await authenticateApiRequest(request);

        if (isAuthError(authResult)) {
            return NextResponse.json(
                { error: authResult.error },
                { status: authResult.status }
            );
        }

        const body = await request.json();

        if (!body || typeof body.steps !== "number") {
            // Shortcuts sometimes sends numbers as strings, let's gracefully handle parseInt
            if (typeof body.steps === "string") {
                const parsed = parseInt(body.steps, 10);
                if (isNaN(parsed)) {
                    return NextResponse.json(
                        { error: "Invalid payload. Expected { steps: number }." },
                        { status: 400 }
                    );
                }
                body.steps = parsed;
            } else {
                return NextResponse.json(
                    { error: "Invalid payload. Expected { steps: number }." },
                    { status: 400 }
                );
            }
        }

        const { userId } = authResult;
        const today = getToday();
        const supabase = createAdminClient();

        const { error: upsertError } = await supabase
            .from("step_entries")
            .upsert(
                {
                    user_id: userId,
                    steps: body.steps,
                    logged_at: today,
                },
                { onConflict: "user_id,logged_at" }
            );

        if (upsertError) {
            console.error("Step insert error:", upsertError);
            return NextResponse.json(
                { error: "Failed to log steps." },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { success: true, steps: body.steps, logged_at: today },
            { status: 200 }
        );
    } catch (err) {
        console.error("Steps API Error:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
