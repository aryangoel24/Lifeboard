"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { ChevronLeft, ChevronRight, Plus, Settings, Pencil, Trash2, ChefHat } from "lucide-react";
import {
    setBudgetGoal,
    addExpenseEntry,
    updateExpenseEntry,
    deleteExpenseEntry,
} from "@/lib/actions/budget";
import type { BudgetGoal, ExpenseEntry } from "@/types/database";
import { format, parseISO } from "date-fns";

export const SPENDING_CATEGORIES = [
    { id: "groceries", label: "Groceries", emoji: "🛒" },
    { id: "restaurants", label: "Restaurants & Delivery", emoji: "🍽️" },
    { id: "alcohol", label: "Alcohol", emoji: "🍺" },
    { id: "clothing", label: "Clothing & Shopping", emoji: "🛍️" },
    { id: "entertainment", label: "Entertainment", emoji: "🎮" },
    { id: "investing", label: "Investing", emoji: "📈" },
    { id: "other", label: "Other", emoji: "📦" },
];

function getCategoryInfo(id: string | null) {
    return SPENDING_CATEGORIES.find((c) => c.id === id) || { id: "other", label: id || "Other", emoji: "📦" };
}

interface BudgetSummary {
    totalSpend: number;
    byCategory: Record<string, { count: number; total: number }>;
    grocerySpend: number;
}

interface BudgetClientProps {
    budgetGoals: BudgetGoal[];
    summary: BudgetSummary | null;
    expenses: ExpenseEntry[];
    cookingStats: { totalMeals: number; homeCookedMeals: number; percentage: number } | null;
    view: "weekly" | "monthly";
    offset: number;
    startDate: string;
    endDate: string;
}

function PeriodLabel({ view, startDate, endDate }: { view: "weekly" | "monthly"; startDate: string; endDate: string }) {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (view === "monthly") {
        return <span>{format(start, "MMMM yyyy")}</span>;
    }
    return (
        <span>
            Week of {format(start, "MMM d")}–{format(end, "d, yyyy")}
        </span>
    );
}

export function BudgetClient({
    budgetGoals,
    summary,
    expenses,
    cookingStats,
    view,
    offset,
    startDate,
    endDate,
}: BudgetClientProps) {
    const router = useRouter();
    const [, startNavTransition] = useTransition();

    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [budgetsDialogOpen, setBudgetsDialogOpen] = useState(false);
    const [editExpense, setEditExpense] = useState<ExpenseEntry | null>(null);
    const [saving, setSaving] = useState(false);

    // Period navigation
    function navigate(newOffset: number) {
        startNavTransition(() => {
            router.push(`/budget?view=${view}&offset=${newOffset}`);
        });
    }

    function switchView(newView: "weekly" | "monthly") {
        startNavTransition(() => {
            router.push(`/budget?view=${newView}&offset=0`);
        });
    }

    const overallGoal = budgetGoals.find((g) => g.category === null) || null;

    // Build category goals map
    const categoryGoalMap: Record<string, BudgetGoal> = {};
    for (const g of budgetGoals) {
        if (g.category) categoryGoalMap[g.category] = g;
    }

    // Categories to show: those with spending OR a budget goal
    const activeCategoryIds = new Set<string>([
        ...SPENDING_CATEGORIES.map((c) => c.id),
    ]);
    if (summary) {
        for (const cat of Object.keys(summary.byCategory)) activeCategoryIds.add(cat);
    }
    for (const g of budgetGoals) {
        if (g.category) activeCategoryIds.add(g.category);
    }

    const visibleCategories = SPENDING_CATEGORIES.filter((c) => {
        const hasSpend = summary?.byCategory[c.id]?.total;
        const hasBudget = categoryGoalMap[c.id];
        return hasSpend || hasBudget;
    });

    // Overall budget progress
    const totalSpend = summary?.totalSpend || 0;
    const overallPercent = overallGoal
        ? Math.min(Math.round((totalSpend / overallGoal.amount) * 100), 100)
        : 0;

    async function handleAddExpense(formData: FormData) {
        setSaving(true);
        const result = await addExpenseEntry(formData);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Expense added!");
            setAddDialogOpen(false);
        }
        setSaving(false);
    }

    async function handleEditExpense(id: string, formData: FormData) {
        setSaving(true);
        const amount = parseFloat(formData.get("amount") as string);
        const category = (formData.get("category") as string) || null;
        const merchant_name = (formData.get("merchant_name") as string) || null;
        const description = (formData.get("description") as string) || null;
        const result = await updateExpenseEntry(id, { amount, category, merchant_name, description });
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Expense updated!");
            setEditExpense(null);
        }
        setSaving(false);
    }

    async function handleDeleteExpense(id: string) {
        const result = await deleteExpenseEntry(id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Expense deleted");
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Budget</h1>
                    <p className="text-muted-foreground text-sm mt-1">Track your spending</p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4 mr-1" />
                                Add Expense
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Expense</DialogTitle>
                            </DialogHeader>
                            <form action={handleAddExpense} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="add-amount">Amount ($)</Label>
                                    <Input
                                        id="add-amount"
                                        name="amount"
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-merchant">Merchant</Label>
                                    <Input
                                        id="add-merchant"
                                        name="merchant_name"
                                        placeholder="Store or service name"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-category">Category</Label>
                                    <Select name="category">
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SPENDING_CATEGORIES.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.emoji} {c.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-date">Date</Label>
                                    <Input
                                        id="add-date"
                                        name="expense_date"
                                        type="date"
                                        defaultValue={new Date().toISOString().slice(0, 10)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-desc">Description (optional)</Label>
                                    <Input id="add-desc" name="description" placeholder="Notes" />
                                </div>
                                <Button type="submit" className="w-full" disabled={saving}>
                                    {saving ? "Saving..." : "Add Expense"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={budgetsDialogOpen} onOpenChange={setBudgetsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Settings className="h-4 w-4 mr-1" />
                                Set Budgets
                            </Button>
                        </DialogTrigger>
                        <ManageBudgetsDialog
                            budgetGoals={budgetGoals}
                            onClose={() => setBudgetsDialogOpen(false)}
                        />
                    </Dialog>
                </div>
            </div>

            {/* Period Navigator */}
            <div className="flex flex-col items-center gap-2 mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(offset - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[200px] text-center">
                        <PeriodLabel view={view} startDate={startDate} endDate={endDate} />
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(offset + 1)}
                        disabled={offset >= 0}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant={view === "weekly" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => switchView("weekly")}
                    >
                        Weekly
                    </Button>
                    <Button
                        variant={view === "monthly" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => switchView("monthly")}
                    >
                        Monthly
                    </Button>
                </div>
            </div>

            {/* Overall Budget Card */}
            {overallGoal && (
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                                {overallGoal.period === "weekly" ? "Weekly" : "Monthly"} Budget
                            </span>
                            <span className="text-sm text-muted-foreground">
                                ${totalSpend.toFixed(2)} / ${overallGoal.amount.toFixed(2)}
                            </span>
                        </div>
                        <div className="h-3 bg-secondary rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    overallPercent >= 90
                                        ? "bg-destructive"
                                        : overallPercent >= 70
                                        ? "bg-amber-500"
                                        : "bg-green-500"
                                }`}
                                style={{ width: `${overallPercent}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            ${Math.max(overallGoal.amount - totalSpend, 0).toFixed(2)} remaining
                            {overallPercent >= 90 && totalSpend < overallGoal.amount && (
                                <span className="text-amber-600 dark:text-amber-400 ml-2">
                                    Approaching limit
                                </span>
                            )}
                            {totalSpend >= overallGoal.amount && (
                                <span className="text-destructive ml-2">Budget exceeded</span>
                            )}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Category Budget Cards */}
            {visibleCategories.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    {visibleCategories.map((cat) => {
                        const spent = summary?.byCategory[cat.id]?.total || 0;
                        const goal = categoryGoalMap[cat.id];
                        const pct = goal ? Math.min(Math.round((spent / goal.amount) * 100), 100) : 0;
                        return (
                            <Card key={cat.id}>
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">{cat.emoji}</span>
                                        <span className="text-xs font-medium truncate">{cat.label}</span>
                                    </div>
                                    <p className="text-lg font-bold">${spent.toFixed(2)}</p>
                                    {goal ? (
                                        <>
                                            <p className="text-xs text-muted-foreground">
                                                / ${goal.amount.toFixed(2)} limit
                                            </p>
                                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        pct >= 90
                                                            ? "bg-destructive"
                                                            : pct >= 70
                                                            ? "bg-amber-500"
                                                            : "bg-green-500"
                                                    }`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">no limit set</p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Expenses List */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-base">Expenses</CardTitle>
                    <CardDescription>
                        {expenses.length === 0 ? "No expenses this period" : `${expenses.length} expense${expenses.length !== 1 ? "s" : ""}`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {expenses.length === 0 ? (
                        <p className="text-muted-foreground text-sm text-center py-4">
                            No expenses recorded for this period
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {expenses.map((expense) => {
                                const cat = getCategoryInfo(expense.category);
                                return (
                                    <div
                                        key={expense.id}
                                        className="flex items-center justify-between py-2 border-b last:border-0"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-base">{cat.emoji}</span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {expense.merchant_name || expense.description || "Expense"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {expense.expense_date} ·{" "}
                                                    <Badge variant="secondary" className="text-xs py-0 h-4">
                                                        {cat.label}
                                                    </Badge>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-semibold text-sm">
                                                ${expense.amount.toFixed(2)}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setEditExpense(expense)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteExpense(expense.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cooking Habits */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ChefHat className="h-4 w-4" />
                        Cooking Habits
                    </CardTitle>
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
                                {cookingStats.percentage}% of your meals this month were homemade
                            </p>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm text-center py-6">
                            Mark meals as &quot;Homemade&quot; to track cooking habits
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Edit Expense Dialog */}
            {editExpense && (
                <Dialog open={!!editExpense} onOpenChange={(open) => !open && setEditExpense(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Expense</DialogTitle>
                        </DialogHeader>
                        <form
                            action={(fd) => handleEditExpense(editExpense.id, fd)}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Label>Amount ($)</Label>
                                <Input
                                    name="amount"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    defaultValue={editExpense.amount}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Merchant</Label>
                                <Input
                                    name="merchant_name"
                                    defaultValue={editExpense.merchant_name || ""}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select name="category" defaultValue={editExpense.category || ""}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SPENDING_CATEGORIES.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.emoji} {c.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input
                                    name="description"
                                    defaultValue={editExpense.description || ""}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setEditExpense(null)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" className="flex-1" disabled={saving}>
                                    {saving ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function ManageBudgetsDialog({
    budgetGoals,
    onClose,
}: {
    budgetGoals: BudgetGoal[];
    onClose: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [period, setPeriod] = useState<"weekly" | "monthly">(
        budgetGoals[0]?.period || "weekly"
    );

    const overallGoal = budgetGoals.find((g) => g.category === null);
    const categoryGoalMap: Record<string, BudgetGoal> = {};
    for (const g of budgetGoals) {
        if (g.category) categoryGoalMap[g.category] = g;
    }

    async function handleSave(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);
        const formData = new FormData(e.currentTarget);

        // Collect all rows
        const rows: { category: string | null; amount: string }[] = [
            { category: null, amount: formData.get("overall") as string },
            ...SPENDING_CATEGORIES.map((c) => ({
                category: c.id,
                amount: formData.get(c.id) as string,
            })),
        ];

        const errors: string[] = [];
        for (const row of rows) {
            const fd = new FormData();
            fd.set("period", period);
            fd.set("amount", row.amount || "");
            fd.set("category", row.category || "");
            const result = await setBudgetGoal(fd);
            if (result?.error) errors.push(result.error);
        }

        if (errors.length > 0) {
            toast.error(errors[0]);
        } else {
            toast.success("Budgets saved!");
            onClose();
        }
        setSaving(false);
    }

    return (
        <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Manage Budgets</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                    <Label>Budget Period</Label>
                    <Select
                        value={period}
                        onValueChange={(v) => setPeriod(v as "weekly" | "monthly")}
                        name="period"
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Leave a field empty to remove that budget limit.
                    </p>

                    {/* Overall */}
                    <div className="flex items-center gap-3">
                        <span className="text-base w-8 text-center">💰</span>
                        <Label className="flex-1 text-sm">Overall</Label>
                        <Input
                            name="overall"
                            type="number"
                            min={0}
                            step={0.01}
                            defaultValue={overallGoal?.amount || ""}
                            placeholder="No limit"
                            className="w-28"
                        />
                    </div>

                    <div className="border-t pt-3 space-y-3">
                        {SPENDING_CATEGORIES.map((cat) => (
                            <div key={cat.id} className="flex items-center gap-3">
                                <span className="text-base w-8 text-center">{cat.emoji}</span>
                                <Label className="flex-1 text-sm">{cat.label}</Label>
                                <Input
                                    name={cat.id}
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    defaultValue={categoryGoalMap[cat.id]?.amount || ""}
                                    placeholder="No limit"
                                    className="w-28"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "Saving..." : "Save All"}
                </Button>
            </form>
        </DialogContent>
    );
}
