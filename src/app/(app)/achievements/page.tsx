import { getAchievements, getStreaks, getEntryStats } from "@/lib/actions/achievements";
import { AchievementsClient } from "@/components/achievements-client";

export default async function AchievementsPage() {
    const [achievements, streaks, entryStats] = await Promise.all([
        getAchievements(),
        getStreaks(),
        getEntryStats(),
    ]);

    return (
        <div className="max-w-4xl mx-auto">
            <AchievementsClient
                achievements={achievements}
                streaks={streaks}
                entryStats={entryStats}
            />
        </div>
    );
}
