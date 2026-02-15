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
        <div className="flex items-center gap-1.5 text-sm">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="font-medium">{count}</span>
            <span className="text-muted-foreground">day streak</span>
        </div>
    );
}
