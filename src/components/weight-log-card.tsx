"use client";

import { useState } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logWeight } from "@/lib/actions/weight";
import { Scale, TrendingDown, TrendingUp, Minus, Pencil } from "lucide-react";
import {
    LineChart,
    Line,
    ResponsiveContainer,
    YAxis,
} from "recharts";
import type { WeightEntry } from "@/types/database";

interface WeightLogCardProps {
    todayWeight: WeightEntry | null;
    recentEntries: WeightEntry[];
    goalWeight: number | null;
    date: string;
}

export function WeightLogCard({
    todayWeight,
    recentEntries,
    goalWeight,
    date,
}: WeightLogCardProps) {
    const [weight, setWeight] = useState(
        todayWeight?.weight?.toString() ?? ""
    );
    const [notes, setNotes] = useState(todayWeight?.notes ?? "");
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(!todayWeight);

    async function handleLog() {
        const value = parseFloat(weight);
        if (isNaN(value) || value <= 0) {
            toast.error("Enter a valid weight");
            return;
        }

        setSaving(true);
        const result = await logWeight(value, date, notes || undefined);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(todayWeight ? "Weight updated" : "Weight logged");
            setEditing(false);
        }
        setSaving(false);
    }

    // Sparkline data
    const sparkData = recentEntries.map((e) => ({
        weight: e.weight,
    }));

    // Trend indicator
    const trend = recentEntries.length >= 2
        ? recentEntries[recentEntries.length - 1].weight -
        recentEntries[recentEntries.length - 2].weight
        : null;

    // Goal progress
    const currentWeight = todayWeight?.weight ?? (recentEntries.length > 0 ? recentEntries[recentEntries.length - 1].weight : null);
    const startWeight = recentEntries.length > 0 ? recentEntries[0].weight : null;
    const goalProgress = goalWeight && currentWeight && startWeight && startWeight !== goalWeight
        ? Math.min(Math.max(((startWeight - currentWeight) / (startWeight - goalWeight)) * 100, 0), 100)
        : null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Scale className="h-4 w-4 text-blue-500" />
                    Weight
                    {trend !== null && (
                        <span className="ml-auto flex items-center gap-1 text-xs font-normal">
                            {trend > 0 ? (
                                <>
                                    <TrendingUp className="h-3 w-3 text-red-500" />
                                    <span className="text-red-500">
                                        +{trend.toFixed(1)} kg
                                    </span>
                                </>
                            ) : trend < 0 ? (
                                <>
                                    <TrendingDown className="h-3 w-3 text-green-500" />
                                    <span className="text-green-500">
                                        {trend.toFixed(1)} kg
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">
                                        No change
                                    </span>
                                </>
                            )}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2 items-center">
                    {editing ? (
                        <>
                            <Input
                                type="number"
                                step={0.1}
                                min={0}
                                placeholder="e.g. 72.5"
                                value={weight}
                                onChange={(e) => setWeight(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleLog();
                                    }
                                }}
                                className="flex-1"
                                autoFocus={!!todayWeight}
                            />
                            <span className="text-sm text-muted-foreground">kg</span>
                            <Button
                                size="sm"
                                onClick={handleLog}
                                disabled={saving || !weight}
                            >
                                {saving ? "..." : todayWeight ? "Save" : "Log"}
                            </Button>
                            {todayWeight && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setWeight(todayWeight.weight.toString());
                                        setNotes(todayWeight.notes ?? "");
                                        setEditing(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <span className="text-lg font-semibold flex-1">
                                {weight} kg
                            </span>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setEditing(true)}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                </div>

                {/* Notes input (editing mode) */}
                {editing && (
                    <Input
                        placeholder="Notes (optional)"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="text-sm"
                    />
                )}

                {/* Notes display (view mode) */}
                {!editing && todayWeight?.notes && (
                    <p className="text-xs text-muted-foreground italic">
                        {todayWeight.notes}
                    </p>
                )}

                {/* Goal progress bar */}
                {goalWeight && currentWeight && goalProgress !== null && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Goal: {goalWeight} kg</span>
                            <span>
                                {(currentWeight - goalWeight) > 0
                                    ? `${(currentWeight - goalWeight).toFixed(1)} kg to go`
                                    : "Goal reached!"}
                            </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${goalProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Show goal text when no progress bar data */}
                {goalWeight && todayWeight && !editing && goalProgress === null && (
                    <p className="text-xs text-muted-foreground">
                        Goal: {goalWeight} kg
                        {" \u00b7 "}
                        {(todayWeight.weight - goalWeight) > 0
                            ? `${(todayWeight.weight - goalWeight).toFixed(1)} kg to go`
                            : "Goal reached!"}
                    </p>
                )}

                {sparkData.length > 1 && (
                    <div style={{ minWidth: 0, width: "100%", height: 40 }}>
                        <ResponsiveContainer width="100%" height={40}>
                            <LineChart data={sparkData}>
                                <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} hide />
                                <Line
                                    type="monotone"
                                    dataKey="weight"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={1.5}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
