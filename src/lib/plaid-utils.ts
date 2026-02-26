import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
    Products,
    CountryCode,
    Transaction,
} from "plaid";

function getPlaidClient(): PlaidApi | null {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = process.env.PLAID_ENV || "sandbox";

    if (!clientId || !secret) return null;

    const configuration = new Configuration({
        basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
        baseOptions: {
            headers: {
                "PLAID-CLIENT-ID": clientId,
                "PLAID-SECRET": secret,
            },
        },
    });

    return new PlaidApi(configuration);
}

export async function createLinkToken(userId: string): Promise<string | null> {
    const client = getPlaidClient();
    if (!client) return null;

    const response = await client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Food Tracker",
        products: [Products.Transactions],
        country_codes: [CountryCode.Ca],
        language: "en",
    });

    return response.data.link_token;
}

export async function exchangePublicToken(
    publicToken: string
): Promise<{ access_token: string; item_id: string } | null> {
    const client = getPlaidClient();
    if (!client) return null;

    const response = await client.itemPublicTokenExchange({
        public_token: publicToken,
    });

    return {
        access_token: response.data.access_token,
        item_id: response.data.item_id,
    };
}

export interface PlaidSyncResult {
    added: Transaction[];
    modified: Transaction[];
    removed: { transaction_id: string }[];
    next_cursor: string;
    has_more: boolean;
}

export class PlaidSyncError extends Error {
    constructor(public readonly needsRelink: boolean, message: string) {
        super(message);
    }
}

const RELINK_CODES = ["ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"];

export async function syncTransactions(
    accessToken: string,
    cursor?: string | null
): Promise<PlaidSyncResult> {
    const client = getPlaidClient();
    if (!client) throw new PlaidSyncError(false, "Plaid not configured");

    try {
        const response = await client.transactionsSync({
            access_token: accessToken,
            cursor: cursor ?? undefined,
        });

        return {
            added: response.data.added,
            modified: response.data.modified,
            removed: response.data.removed,
            next_cursor: response.data.next_cursor,
            has_more: response.data.has_more,
        };
    } catch (err) {
        if (err instanceof PlaidSyncError) throw err;
        const code = (err as { response?: { data?: { error_code?: string } } })
            ?.response?.data?.error_code;
        throw new PlaidSyncError(
            RELINK_CODES.includes(code ?? ""),
            `Sync failed: ${code ?? "unknown error"}`
        );
    }
}

const EXPECTED_REMOVE_CODES = ["ITEM_NOT_FOUND", "ITEM_LOGIN_REQUIRED", "ACCESS_NOT_GRANTED"];

export async function removeItem(accessToken: string): Promise<void> {
    const client = getPlaidClient();
    if (!client) return;
    try {
        await client.itemRemove({ access_token: accessToken });
    } catch (err) {
        // Item may already be removed or access revoked — expected; safe to ignore.
        const code = (err as { response?: { data?: { error_code?: string } } })
            ?.response?.data?.error_code;
        if (!EXPECTED_REMOVE_CODES.includes(code ?? "")) {
            console.error("Plaid itemRemove unexpected error:", code ?? "unknown");
        }
    }
}

// Plaid personal_finance_category primary → your spending category
const PLAID_CATEGORY_MAP: Record<string, string> = {
    FOOD_AND_DRINK: "restaurants",
    GROCERIES: "groceries",
    GENERAL_MERCHANDISE: "clothing",
    CLOTHING_AND_ACCESSORIES: "clothing",
    ENTERTAINMENT: "entertainment",
    TRANSFER_OUT: "investing",
    GENERAL_SERVICES: "other",
};

export function mapPlaidCategory(plaidPrimaryCategory: string | null | undefined): string {
    if (!plaidPrimaryCategory) return "other";

    // Special case: liquor stores in general services
    const upper = plaidPrimaryCategory.toUpperCase();
    return PLAID_CATEGORY_MAP[upper] ?? "other";
}
