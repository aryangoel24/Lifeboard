import { getBudgetGoal, getBudgetSummary, getCookingStats } from "@/lib/actions/budget";
import { BudgetClient } from "@/components/budget-client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export default async function BudgetPage() {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const monthStart = startOfMonth(now).toISOString();
    const monthEnd = endOfMonth(now).toISOString();

    const [budgetGoal, weeklySummary, monthlySummary, cookingStats] =
        await Promise.all([
            getBudgetGoal(),
            getBudgetSummary(weekStart, weekEnd),
            getBudgetSummary(monthStart, monthEnd),
            getCookingStats(monthStart, monthEnd),
        ]);

    return (
        <div className="max-w-4xl mx-auto">
            <BudgetClient
                budgetGoal={budgetGoal}
                weeklySummary={weeklySummary}
                monthlySummary={monthlySummary}
                cookingStats={cookingStats}
            />
        </div>
    );
}
