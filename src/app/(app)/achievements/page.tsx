import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAchievements, getStreaks, getEntryStats } from "@/lib/actions/achievements";
import { AchievementsClient } from "@/components/achievements-client";

export default async function AchievementsPage() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

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
