"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { getLinkToken, savePlaidConnection } from "@/lib/actions/plaid";
import { useRouter } from "next/navigation";

export function PlaidLinkButton() {
    const router = useRouter();
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        setLoading(true);
        getLinkToken().then(({ linkToken, error }) => {
            if (error || !linkToken) {
                // Plaid not configured — silently hide the button
                setLinkToken(null);
            } else {
                setLinkToken(linkToken);
            }
            setLoading(false);
        });
    }, []);

    const onSuccess = useCallback(
        async (publicToken: string, metadata: { institution: { name: string } | null }) => {
            setConnecting(true);
            const institutionName = metadata.institution?.name || "Unknown Bank";
            const result = await savePlaidConnection(publicToken, institutionName);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`${institutionName} connected!`);
                router.refresh();
            }
            setConnecting(false);
        },
        [router]
    );

    const { open, ready } = usePlaidLink({
        token: linkToken ?? "",
        onSuccess,
        onExit: () => {},
    });

    // If Plaid is not configured or loading, render nothing
    if (loading) return null;
    if (!linkToken) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={() => open()}
            disabled={!ready || connecting}
        >
            {connecting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
                <Landmark className="h-4 w-4 mr-1" />
            )}
            Connect Bank
        </Button>
    );
}
