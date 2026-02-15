import { getMacroTrends, getWeeklySummary, getMealBreakdown } from "@/lib/actions/analytics";
import { formatDate } from "@/lib/utils";
import { AnalyticsClient } from "@/components/analytics-client";

export default async function AnalyticsPage() {
    const today = formatDate(new Date());

    const [trends, weeklySummary, mealBreakdown] = await Promise.all([
        getMacroTrends(30),
        getWeeklySummary(),
        getMealBreakdown(today),
    ]);

    return (
        <div className="max-w-4xl mx-auto">
            <AnalyticsClient
                trends={trends}
                weeklySummary={weeklySummary}
                mealBreakdown={mealBreakdown}
            />
        </div>
    );
}
