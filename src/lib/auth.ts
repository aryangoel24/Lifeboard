"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Lightweight helper to get the authenticated user's ID.
 * Use in page components that need user.id but where the layout
 * already handles the auth redirect.
 */
export async function getAuthUserId(): Promise<string | null> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
}
