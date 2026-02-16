"use client";

import { useState, useEffect } from "react";
import {
  generateApiToken,
  regenerateApiToken,
  toggleApiAccess,
} from "@/lib/actions/api-token";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ApiTokenCardProps {
  hasToken: boolean;
  apiEnabled: boolean;
}

export function ApiTokenCard({ hasToken, apiEnabled }: ApiTokenCardProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(apiEnabled);
  const [tokenExists, setTokenExists] = useState(hasToken);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  async function handleGenerate() {
    setLoading(true);
    const result = tokenExists
      ? await regenerateApiToken()
      : await generateApiToken();

    if (result.error) {
      toast.error(result.error);
    } else if (result.token) {
      setToken(result.token);
      setTokenExists(true);
      setEnabled(true);
      toast.success("API token generated");
    }
    setLoading(false);
  }

  async function handleToggle() {
    const newEnabled = !enabled;
    setLoading(true);
    const result = await toggleApiAccess(newEnabled);
    if (result.error) {
      toast.error(result.error);
    } else {
      setEnabled(newEnabled);
      toast.success(`API access ${newEnabled ? "enabled" : "disabled"}`);
    }
    setLoading(false);
  }

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    toast.success("Token copied to clipboard");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Access</CardTitle>
            <CardDescription>
              Use API tokens to log food and habits from iOS Shortcuts
            </CardDescription>
          </div>
          {tokenExists && (
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {token && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">
              Copy this token now — it won&apos;t be shown again.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                {token}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                Copy
              </Button>
            </div>
          </div>
        )}

        {!token && tokenExists && (
          <p className="text-sm text-muted-foreground">
            An API token has been generated. You can regenerate it if needed.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={loading}
            variant={tokenExists ? "outline" : "default"}
          >
            {loading
              ? "Generating..."
              : tokenExists
                ? "Regenerate Token"
                : "Generate Token"}
          </Button>

          {tokenExists && (
            <Button
              onClick={handleToggle}
              disabled={loading}
              variant="outline"
            >
              {enabled ? "Disable API" : "Enable API"}
            </Button>
          )}
        </div>

        {tokenExists && baseUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">API Base URL</p>
            <code className="block rounded bg-muted px-3 py-2 text-xs font-mono">
              {baseUrl}/api/v1
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
