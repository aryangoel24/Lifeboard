import { createClient } from "@supabase/supabase-js";

/**
 * Service role client — bypasses RLS entirely.
 * Use ONLY in server actions for operations that require access to restricted tables
 * (e.g. plaid_connections which has access_token revoked from anon/authenticated).
 * Never import this in client components.
 */
export function createServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}
