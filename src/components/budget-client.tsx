"use client";

import { useState } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DollarSign, TrendingDown, ChefHat, Target, Utensils } from "lucide-react";
import { setBudgetGoal } from "@/lib/actions/budget";
import type { BudgetGoal } from "@/types/database";

const SOURCE_LABELS: Record<string, { label: string; emoji: string }> = {
    homemade: { label: "Homemade", emoji: "🏠" },
    restaurant: { label: "Restaurant", emoji: "🍽️" },
    takeout: { label: "Takeout", emoji: "🥡" },
    grocery_prepared: { label: "Grocery", emoji: "🛒" },
    unspecified: { label: "Unspecified", emoji: "❓" },
};

interface BudgetClientProps {
    budgetGoal: BudgetGoal | null;
    weeklySummary: {
        totalSpend: number;
        mealCount: number;
        avgCostPerMeal: number;
        costPerProtein: number;
        bySource: Record<string, { count: number; total: number }>;
    } | null;
    monthlySummary: {
        totalSpend: number;
        mealCount: number;
        avgCostPerMeal: number;
        costPerProtein: number;
        bySource: Record<string, { count: number; total: number }>;
    } | null;
    cookingStats: {
        totalMeals: number;
        homeCookedMeals: number;
        percentage: number;
    } | null;
}

export function BudgetClient({
    budgetGoal,
    weeklySummary,
    monthlySummary,
    cookingStats,
}: BudgetClientProps) {
    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const summary = weeklySummary;

    async function handleSetGoal(formData: FormData) {
        setLoading(true);
        const result = await setBudgetGoal(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Budget goal set!");
            setGoalDialogOpen(false);
        }
        setLoading(false);
    }

    const budgetUsed = budgetGoal
        ? budgetGoal.period === "weekly"
            ? weeklySummary?.totalSpend || 0
            : monthlySummary?.totalSpend || 0
        : 0;
    const budgetPercent = budgetGoal
        ? Math.min(Math.round((budgetUsed / budgetGoal.amount) * 100), 100)
        : 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Budget & Cooking</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track food spending and cooking habits
                    </p>
                </div>
                <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Target className="h-4 w-4 mr-2" />
                            Set Budget
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Set Food Budget</DialogTitle>
                        </DialogHeader>
                        <form action={handleSetGoal} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="period">Period</Label>
                                <Select name="period" defaultValue={budgetGoal?.period || "weekly"}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Budget Amount ($)</Label>
                                <Input
                                    id="amount"
                                    name="amount"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    defaultValue={budgetGoal?.amount || ""}
                                    placeholder="100.00"
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Saving..." : "Save Budget"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Budget Progress */}
            {budgetGoal && (
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                                {budgetGoal.period === "weekly" ? "Weekly" : "Monthly"} Budget
                            </span>
                            <span className="text-sm text-muted-foreground">
                                ${budgetUsed.toFixed(2)} / ${budgetGoal.amount.toFixed(2)}
                            </span>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${budgetPercent >= 90
                                        ? "bg-destructive"
                                        : budgetPercent >= 70
                                            ? "bg-amber-500"
                                            : "bg-green-500"
                                    }`}
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            ${(budgetGoal.amount - budgetUsed).toFixed(2)} remaining
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-green-500/10">
                                <DollarSign className="h-4 w-4 text-green-500" />
                            </div>
                            <span className="text-sm text-muted-foreground">This Week</span>
                        </div>
                        <p className="text-2xl font-bold">
                            ${(weeklySummary?.totalSpend || 0).toFixed(2)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-blue-500/10">
                                <TrendingDown className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-muted-foreground">Avg/Meal</span>
                        </div>
                        <p className="text-2xl font-bold">
                            ${(summary?.avgCostPerMeal || 0).toFixed(2)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-purple-500/10">
                                <Utensils className="h-4 w-4 text-purple-500" />
                            </div>
                            <span className="text-sm text-muted-foreground">$/g Protein</span>
                        </div>
                        <p className="text-2xl font-bold">
                            ${(summary?.costPerProtein || 0).toFixed(2)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-amber-500/10">
                                <ChefHat className="h-4 w-4 text-amber-500" />
                            </div>
                            <span className="text-sm text-muted-foreground">Home Cooked</span>
                        </div>
                        <p className="text-2xl font-bold">{cookingStats?.percentage || 0}%</p>
                    </CardContent>
                </Card>
            </div>

            {/* Spending by Source */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Weekly Breakdown</CardTitle>
                        <CardDescription>Spending by meal source</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {weeklySummary && Object.keys(weeklySummary.bySource).length > 0 ? (
                            <div className="space-y-3">
                                {Object.entries(weeklySummary.bySource).map(([source, data]) => {
                                    const info = SOURCE_LABELS[source] || SOURCE_LABELS.unspecified;
                                    const pct =
                                        weeklySummary.totalSpend > 0
                                            ? Math.round((data.total / weeklySummary.totalSpend) * 100)
                                            : 0;
                                    return (
                                        <div key={source}>
                                            <div className="flex items-center justify-between text-sm mb-1">
                                                <span>
                                                    {info.emoji} {info.label}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    ${data.total.toFixed(2)} ({data.count} meals)
                                                </span>
                                            </div>
                                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm text-center py-6">
                                Add cost info to food entries to see breakdown
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Cooking Habits</CardTitle>
                        <CardDescription>This month&apos;s home cooking stats</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {cookingStats && cookingStats.totalMeals > 0 ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm">Home-cooked meals</span>
                                    <Badge variant="secondary">
                                        {cookingStats.homeCookedMeals} / {cookingStats.totalMeals}
                                    </Badge>
                                </div>
                                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full transition-all"
                                        style={{ width: `${cookingStats.percentage}%` }}
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {cookingStats.percentage}% of your meals this month were
                                    homemade
                                </p>
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm text-center py-6">
                                Mark meals as &quot;Homemade&quot; to track cooking habits
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
