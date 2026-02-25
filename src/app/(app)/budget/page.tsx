import {
    getBudgetGoals,
    getBudgetSummary,
    getCookingStats,
    getExpenseEntries,
} from "@/lib/actions/budget";
import { BudgetClient } from "@/components/budget-client";
import {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    addWeeks,
    addMonths,
} from "date-fns";
import { getNow } from "@/lib/timezone";

interface BudgetPageProps {
    searchParams: { view?: string; offset?: string };
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
    const view = searchParams.view === "monthly" ? "monthly" : "weekly";
    const offset = parseInt(searchParams.offset || "0", 10) || 0;

    const now = getNow();

    let startDate: string;
    let endDate: string;

    if (view === "monthly") {
        const base = addMonths(now, offset);
        startDate = startOfMonth(base).toISOString();
        endDate = endOfMonth(base).toISOString();
    } else {
        const base = addWeeks(now, offset);
        startDate = startOfWeek(base, { weekStartsOn: 1 }).toISOString();
        endDate = endOfWeek(base, { weekStartsOn: 1 }).toISOString();
    }

    // Always fetch cooking stats for the current month regardless of period nav
    const monthStart = startOfMonth(now).toISOString();
    const monthEnd = endOfMonth(now).toISOString();

    const [budgetGoals, summary, expenses, cookingStats] = await Promise.all([
        getBudgetGoals(),
        getBudgetSummary(startDate, endDate),
        getExpenseEntries(startDate, endDate),
        getCookingStats(monthStart, monthEnd),
    ]);

    return (
        <div className="max-w-4xl mx-auto">
            <BudgetClient
                budgetGoals={budgetGoals}
                summary={summary}
                expenses={expenses}
                cookingStats={cookingStats}
                view={view}
                offset={offset}
                startDate={startDate}
                endDate={endDate}
            />
        </div>
    );
}
