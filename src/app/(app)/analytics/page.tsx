import { getAnalyticsData } from "@/lib/actions/analytics";
import { AnalyticsClient } from "@/components/analytics-client";
import { getToday } from "@/lib/timezone";

interface AnalyticsPageProps {
    searchParams: { date?: string };
}

export default async function AnalyticsPage({
    searchParams,
}: AnalyticsPageProps) {
    const today = searchParams.date || getToday();
    const {
        trends, weeklySummary, mealBreakdown, weightEntries, weightStats,
        weightCalories, tdee, habitWeeklyStats, habitDailyData,
    } = await getAnalyticsData(today);

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
                habitDailyData={habitDailyData}
            />
        </div>
    );
}
