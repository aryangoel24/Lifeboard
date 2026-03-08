import { getAnalyticsData } from "@/lib/actions/analytics";
import { getDebtState } from "@/lib/actions/habit-debt";
import dynamic from "next/dynamic";
import { getToday } from "@/lib/timezone";

const AnalyticsClient = dynamic(
    () => import("@/components/analytics-client").then((m) => ({ default: m.AnalyticsClient })),
    {
        ssr: false,
        loading: () => (
            <div className="max-w-4xl mx-auto space-y-6 py-6">
                <div className="h-10 w-48 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
                    ))}
                </div>
                <div className="h-64 bg-muted animate-pulse rounded-lg" />
                <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
        ),
    }
);

interface AnalyticsPageProps {
    searchParams: { date?: string };
}

export default async function AnalyticsPage({
    searchParams,
}: AnalyticsPageProps) {
    const viewDate = searchParams.date || getToday();
    const today = getToday();
    const [analyticsData, debtState] = await Promise.all([
        getAnalyticsData(viewDate),
        getDebtState(),
    ]);
    const {
        trends, weeklySummary, mealBreakdown, weightEntries, weightStats,
        weightCalories, tdee, habitWeeklyStats, habitEntries,
        customHabits, customHabitEntries, creatineGoal,
    } = analyticsData;

    return (
        <div className="max-w-4xl mx-auto">
            <AnalyticsClient
                trends={trends}
                weeklySummary={weeklySummary}
                mealBreakdown={mealBreakdown}
                weightEntries={weightEntries}
                weightStats={weightStats}
                weightCalories={weightCalories}
                tdee={tdee}
                habitWeeklyStats={habitWeeklyStats}
                habitEntries={habitEntries}
                customHabits={customHabits}
                customHabitEntries={customHabitEntries}
                creatineGoal={creatineGoal}
                debtState={debtState}
                today={today}
            />
        </div>
    );
}
