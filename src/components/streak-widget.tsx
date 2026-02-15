import { Flame } from "lucide-react";
import type { UserStreak } from "@/types/database";

interface StreakWidgetProps {
    streaks: UserStreak[];
}

export function StreakWidget({ streaks }: StreakWidgetProps) {
    const loggingStreak = streaks.find((s) => s.streak_type === "logging");
    const count = loggingStreak?.current_count || 0;

    if (count === 0) return null;

    return (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-sm">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-semibold text-orange-600 dark:text-orange-400">{count}</span>
            <span className="text-orange-600/70 dark:text-orange-400/70 text-xs">day streak</span>
        </div>
    );
}
