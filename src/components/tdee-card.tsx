"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Flame,
    TrendingDown,
    TrendingUp,
    Minus,
    Target,
    Activity,
    Info,
} from "lucide-react";
import type { TDEEResponse } from "@/lib/actions/weight";

interface TDEECardProps {
    tdee: TDEEResponse;
}

const CONFIDENCE_COLORS = {
    low: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
    medium: "bg-blue-500/15 text-blue-600 border-blue-500/20",
    high: "bg-green-500/15 text-green-600 border-green-500/20",
};

export function TDEECard({ tdee }: TDEECardProps) {
    if (tdee.status === "insufficient") {
        const { weightDays, calorieDays, bothDays, requiredDays } = tdee.progress;

        // 70% of 28 days = 19.6 -> 20 days needed for completeness check
        const requiredOverlap = Math.ceil(28 * 0.7);

        const weightPct = Math.min(100, (weightDays / requiredDays) * 100);
        const caloriePct = Math.min(100, (calorieDays / requiredDays) * 100);
        const bothPct = Math.min(100, (bothDays / requiredOverlap) * 100);

        return (
            <Card className="border-dashed">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Flame className="h-4 w-4 text-orange-500" />
                        TDEE Estimate
                        <Badge variant="outline" className="ml-auto text-xs font-normal">
                            Collecting data
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Keep logging weight and meals daily to unlock your personalized TDEE estimate.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Weight entries</span>
                            <span className="font-medium">{weightDays}/{requiredDays}</span>
                        </div>
                        <Progress value={weightPct} className="h-2" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Calorie days (≥800 cal)</span>
                            <span className="font-medium">{calorieDays}/{requiredDays}</span>
                        </div>
                        <Progress value={caloriePct} className="h-2" />
                    </div>
                    <div className="space-y-1.5 mt-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Days with both logged</span>
                            <span className="font-medium">{bothDays}/{requiredOverlap}</span>
                        </div>
                        <Progress value={bothPct} className="h-2 bg-primary/20" />
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                        <Info className="h-3 w-3" />
                        Needs ≥{requiredOverlap} overlapping days in a 28-day window (70% coverage)
                    </p>
                </CardContent>
            </Card>
        );
    }

    const {
        tdee: tdeeValue,
        avgCalories,
        weightTrendPerWeek,
        confidence,
        targetCalories,
        goalDirection,
        currentWeight,
        dataPoints,
    } = tdee.data;

    const trendIcon =
        weightTrendPerWeek > 0.05 ? (
            <TrendingUp className="h-3.5 w-3.5 text-red-500" />
        ) : weightTrendPerWeek < -0.05 ? (
            <TrendingDown className="h-3.5 w-3.5 text-green-500" />
        ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        );

    const trendColor =
        weightTrendPerWeek > 0.05
            ? "text-red-500"
            : weightTrendPerWeek < -0.05
                ? "text-green-500"
                : "text-muted-foreground";

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    Your TDEE
                    <Badge
                        variant="outline"
                        className={`ml-auto text-xs font-normal ${CONFIDENCE_COLORS[confidence]}`}
                    >
                        {confidence} confidence
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Main TDEE number */}
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight">
                        {tdeeValue.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-sm">cal/day</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            Avg intake
                        </p>
                        <p className="text-sm font-semibold">{avgCalories.toLocaleString()} cal</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {trendIcon}
                            Weight trend
                        </p>
                        <p className={`text-sm font-semibold ${trendColor}`}>
                            {weightTrendPerWeek > 0 ? "+" : ""}
                            {weightTrendPerWeek.toFixed(2)} kg/wk
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Based on</p>
                        <p className="text-sm font-semibold">{dataPoints} days</p>
                    </div>
                </div>

                {/* Goal recommendation */}
                {targetCalories !== null && goalDirection && (
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5 text-primary" />
                            {goalDirection === "lose"
                                ? "To lose ~0.5 kg/week"
                                : goalDirection === "gain"
                                    ? "To gain ~0.25 kg/week"
                                    : "To maintain weight"}
                        </p>
                        <p className="text-lg font-bold">
                            Eat ~{targetCalories.toLocaleString()} cal/day
                        </p>
                        {goalDirection !== "maintain" && (
                            <p className="text-xs text-muted-foreground">
                                Currently {currentWeight} kg · Goal{" "}
                                {goalDirection === "lose" ? "↓" : "↑"}{" "}
                                {Math.abs(tdeeValue - targetCalories)} cal/day{" "}
                                {goalDirection === "lose" ? "deficit" : "surplus"}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
