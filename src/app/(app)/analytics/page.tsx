import { getMacroTrends, getWeeklySummary, getMealBreakdown } from "@/lib/actions/analytics";
import { getWeightEntries, getWeightStats, getWeightCalorieCorrelation } from "@/lib/actions/weight";
import { formatDate } from "@/lib/utils";
import { AnalyticsClient } from "@/components/analytics-client";

export default async function AnalyticsPage() {
    const today = formatDate(new Date());

    const [trends, weeklySummary, mealBreakdown, weightEntries, weightStats, weightCalories] =
        await Promise.all([
            getMacroTrends(30),
            getWeeklySummary(),
            getMealBreakdown(today),
            getWeightEntries(90),
            getWeightStats(),
            getWeightCalorieCorrelation(30),
        ]);

    return (
        <div className="max-w-4xl mx-auto">
            <AnalyticsClient
                trends={trends}
                weeklySummary={weeklySummary}
                mealBreakdown={mealBreakdown}
                weightEntries={weightEntries}
                weightStats={weightStats}
                weightCalories={weightCalories}
            />
        </div>
    );
}
