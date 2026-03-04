"use client";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Footprints } from "lucide-react";
import type { StepEntry } from "@/types/database";

interface StepCardProps {
    todaySteps: StepEntry | null;
}

export function StepCard({ todaySteps }: StepCardProps) {
    const steps = todaySteps?.steps ?? 0;
    // A standard goal to show progress against (could be pulled from profile later)
    const goal = 10000;
    const progressPct = Math.min(100, Math.round((steps / goal) * 100));

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Footprints className="h-4 w-4 text-emerald-500" />
                    Today&apos;s Steps
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold tracking-tight">
                        {steps.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-sm">/ {goal.toLocaleString()}</span>
                </div>

                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                {steps === 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                        Not synced yet today. Open iOS Shortcuts to push Health data.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
