import { getAnalyticsData } from "@/lib/actions/analytics";
import { AnalyticsClient } from "@/components/analytics-client";

export default async function AnalyticsPage() {
    const { trends, weeklySummary, mealBreakdown, weightEntries, weightStats, weightCalories, tdee } =
        await getAnalyticsData();

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
            />
        </div>
    );
}
