"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { PlaidConnection } from "@/types/database";
import { createLinkToken, exchangePublicToken, syncTransactions, mapPlaidCategory, removeItem, PlaidSyncError } from "@/lib/plaid-utils";

export async function getLinkToken(): Promise<{ linkToken: string | null; error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { linkToken: null, error: "Unauthorized" };

    const linkToken = await createLinkToken(user.id);
    if (!linkToken) return { linkToken: null, error: "Plaid not configured" };

    return { linkToken };
}

export async function savePlaidConnection(
    publicToken: string,
    institutionName: string
): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const result = await exchangePublicToken(publicToken);
    if (!result) return { error: "Failed to exchange token" };

    // Service client: plaid_connections is revoked from authenticated role
    const service = createServiceClient();
    const { error } = await service.from("plaid_connections").insert({
        user_id: user.id,
        access_token: result.access_token,
        item_id: result.item_id,
        institution_name: institutionName,
    });

    if (error) return { error: error.message };

    revalidatePath("/budget");
    return {};
}

export async function getPlaidConnections(): Promise<PlaidConnection[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    // Service client: plaid_connections is revoked from authenticated role.
    // Explicitly exclude access_token — never return it to the caller.
    const service = createServiceClient();
    const { data } = await service
        .from("plaid_connections")
        .select("id, user_id, item_id, institution_name, sync_cursor, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    return (data as Omit<PlaidConnection, "access_token">[]).map((c) => ({
        ...c,
        access_token: "",
    })) as PlaidConnection[];
}

export async function syncPlaidTransactions(): Promise<{ synced: number; error?: string; needsRelink?: boolean }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { synced: 0, error: "Unauthorized" };

    // Service client: fetch connections including access_token (server-only)
    const service = createServiceClient();
    const { data: connections } = await service
        .from("plaid_connections")
        .select("*")
        .eq("user_id", user.id);

    if (!connections || connections.length === 0) return { synced: 0 };

    let totalSynced = 0;
    const connectionErrors: { message: string; needsRelink: boolean }[] = [];

    for (const connection of connections) {
        let cursor = connection.sync_cursor as string | null;
        let hasMore = true;
        let failed = false;

        while (hasMore && !failed) {
            try {
                const result = await syncTransactions(connection.access_token, cursor);

                // Insert added transactions (expense_entries uses RLS via anon client)
                if (result.added.length > 0) {
                    const rows = result.added.map((txn) => ({
                        user_id: user.id,
                        amount: Math.abs(txn.amount),
                        merchant_name: txn.merchant_name || txn.name || null,
                        category: mapPlaidCategory(
                            (txn.personal_finance_category as { primary?: string } | null)?.primary
                        ),
                        expense_date: txn.date,
                        description: txn.name || null,
                        source: "plaid" as const,
                        is_recurring: false,
                        plaid_transaction_id: txn.transaction_id,
                    }));

                    // Insert one by one to handle duplicates gracefully
                    for (const row of rows) {
                        const { error } = await supabase
                            .from("expense_entries")
                            .insert(row);
                        if (!error) totalSynced++;
                    }
                }

                // Update modified transactions
                for (const txn of result.modified) {
                    await supabase
                        .from("expense_entries")
                        .update({
                            amount: Math.abs(txn.amount),
                            merchant_name: txn.merchant_name || txn.name || null,
                            category: mapPlaidCategory(
                                (txn.personal_finance_category as { primary?: string } | null)?.primary
                            ),
                            expense_date: txn.date,
                        })
                        .eq("plaid_transaction_id", txn.transaction_id)
                        .eq("user_id", user.id);
                }

                // Remove deleted transactions
                for (const removed of result.removed) {
                    await supabase
                        .from("expense_entries")
                        .delete()
                        .eq("plaid_transaction_id", removed.transaction_id)
                        .eq("user_id", user.id);
                }

                // Only advance cursor after successful DB writes
                cursor = result.next_cursor;
                hasMore = result.has_more;
            } catch (err) {
                const needsRelink = err instanceof PlaidSyncError ? err.needsRelink : false;
                connectionErrors.push({
                    message: needsRelink
                        ? `${connection.institution_name || "Bank"} needs to be relinked`
                        : `${connection.institution_name || "Bank"} sync failed — try again later`,
                    needsRelink,
                });
                failed = true;
            }
        }

        // Update cursor only when sync completed successfully
        if (!failed) {
            await service
                .from("plaid_connections")
                .update({ sync_cursor: cursor })
                .eq("id", connection.id)
                .eq("user_id", user.id);
        }
    }

    revalidatePath("/budget");

    if (connectionErrors.length > 0) {
        const first = connectionErrors[0];
        return { synced: totalSynced, error: first.message, needsRelink: first.needsRelink };
    }
    return { synced: totalSynced };
}

export async function disconnectPlaid(connectionId: string): Promise<{ error?: string }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const service = createServiceClient();

    // 1. Fetch access_token for revocation (maybeSingle — row may not exist)
    const { data: connection } = await service
        .from("plaid_connections")
        .select("access_token")
        .eq("id", connectionId)
        .eq("user_id", user.id)
        .maybeSingle();

    // 2. Delete Plaid-imported expense entries
    await supabase
        .from("expense_entries")
        .delete()
        .eq("user_id", user.id)
        .eq("source", "plaid");

    // 3. Delete the connection row
    const { error } = await service
        .from("plaid_connections")
        .delete()
        .eq("id", connectionId)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    // 4. Best-effort revoke at Plaid (non-blocking; local state already clean)
    if (connection?.access_token) {
        removeItem(connection.access_token); // intentionally not awaited
    }

    revalidatePath("/budget");
    return {};
}
