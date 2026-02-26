import {
    getBudgetGoals,
    getBudgetSummary,
    getCookingStats,
    getExpenseEntries,
    getRecurringTemplates,
    ensureRecurringExpensesSpawned,
} from "@/lib/actions/budget";
import { getPlaidConnections } from "@/lib/actions/plaid";
import { BudgetClient } from "@/components/budget-client";
import {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    addWeeks,
    addMonths,
    format,
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
        startDate = format(startOfMonth(base), 'yyyy-MM-dd');
        endDate = format(endOfMonth(base), 'yyyy-MM-dd');
    } else {
        const base = addWeeks(now, offset);
        startDate = format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        endDate = format(endOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    }

    let prevStartDate: string;
    let prevEndDate: string;
    if (view === "monthly") {
        const prevBase = addMonths(now, offset - 1);
        prevStartDate = format(startOfMonth(prevBase), 'yyyy-MM-dd');
        prevEndDate = format(endOfMonth(prevBase), 'yyyy-MM-dd');
    } else {
        const prevBase = addWeeks(now, offset - 1);
        prevStartDate = format(startOfWeek(prevBase, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        prevEndDate = format(endOfWeek(prevBase, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    }

    // Always fetch cooking stats for the current month regardless of period nav
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    // For monthly overall goal displayed in weekly view, compute the containing month's range
    let monthSummaryStart: string;
    let monthSummaryEnd: string;
    let prevMonthSummaryStart: string;
    let prevMonthSummaryEnd: string;

    if (view === "weekly") {
        const weekStart = startOfWeek(addWeeks(now, offset), { weekStartsOn: 1 });
        monthSummaryStart = format(startOfMonth(weekStart), 'yyyy-MM-dd');
        monthSummaryEnd = format(endOfMonth(weekStart), 'yyyy-MM-dd');
        const prevMonthBase = addMonths(weekStart, -1);
        prevMonthSummaryStart = format(startOfMonth(prevMonthBase), 'yyyy-MM-dd');
        prevMonthSummaryEnd = format(endOfMonth(prevMonthBase), 'yyyy-MM-dd');
    } else {
        monthSummaryStart = startDate;
        monthSummaryEnd = endDate;
        prevMonthSummaryStart = prevStartDate;
        prevMonthSummaryEnd = prevEndDate;
    }

    // For monthly view: ensure recurring expenses are spawned before fetching entries
    if (view === "monthly") {
        await ensureRecurringExpensesSpawned(startDate, endDate);
    }

    const [budgetGoals, summary, prevSummary, expenses, cookingStats, rawMonthSummary, rawPrevMonthSummary, recurringTemplates, plaidConnections] =
        await Promise.all([
            getBudgetGoals(),
            getBudgetSummary(startDate, endDate),
            getBudgetSummary(prevStartDate, prevEndDate),
            getExpenseEntries(startDate, endDate),
            getCookingStats(monthStart, monthEnd),
            view === "weekly" ? getBudgetSummary(monthSummaryStart, monthSummaryEnd) : Promise.resolve(null),
            view === "weekly" ? getBudgetSummary(prevMonthSummaryStart, prevMonthSummaryEnd) : Promise.resolve(null),
            view === "monthly" ? getRecurringTemplates() : Promise.resolve([]),
            getPlaidConnections(),
        ]);

    const monthSummary = rawMonthSummary ?? summary;
    const prevMonthSummary = rawPrevMonthSummary ?? prevSummary;

    return (
        <div className="max-w-4xl mx-auto">
            <BudgetClient
                budgetGoals={budgetGoals}
                summary={summary}
                prevSummary={prevSummary}
                monthSummary={monthSummary}
                prevMonthSummary={prevMonthSummary}
                expenses={expenses}
                cookingStats={cookingStats}
                view={view}
                offset={offset}
                startDate={startDate}
                endDate={endDate}
                recurringTemplates={recurringTemplates}
                plaidConnections={plaidConnections}
            />
        </div>
    );
}
