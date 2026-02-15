"use client";

import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Trophy } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/achievements-data";
import type { UserAchievement, UserStreak } from "@/types/database";

const CATEGORY_LABELS: Record<string, string> = {
    consistency: "Consistency",
    nutrition: "Nutrition",
    cooking: "Cooking",
    budget: "Budget",
};

interface AchievementsClientProps {
    achievements: UserAchievement[];
    streaks: UserStreak[];
    entryStats: { totalEntries: number };
}

export function AchievementsClient({
    achievements,
    streaks,
    entryStats,
}: AchievementsClientProps) {
    const unlockedKeys = new Set(achievements.map((a) => a.achievement_key));

    const loggingStreak = streaks.find((s) => s.streak_type === "logging");
    const cookingStreak = streaks.find((s) => s.streak_type === "cooking");

    // Group achievements by category
    const grouped = ACHIEVEMENTS.reduce(
        (acc, achievement) => {
            if (!acc[achievement.category]) acc[achievement.category] = [];
            acc[achievement.category].push(achievement);
            return acc;
        },
        {} as Record<string, typeof ACHIEVEMENTS[number][]>
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Achievements</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {achievements.length} / {ACHIEVEMENTS.length} unlocked
                    </p>
                </div>
            </div>

            {/* Streaks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-orange-500/10">
                                <Flame className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Logging Streak</p>
                                <p className="text-3xl font-bold">
                                    {loggingStreak?.current_count || 0}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Best: {loggingStreak?.longest_count || 0} days
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-green-500/10">
                                <span className="text-lg">👨‍🍳</span>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Cooking Streak</p>
                                <p className="text-3xl font-bold">
                                    {cookingStreak?.current_count || 0}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Best: {cookingStreak?.longest_count || 0} days
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="rounded-md p-2 bg-blue-500/10">
                                <Trophy className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Total Entries</p>
                                <p className="text-3xl font-bold">{entryStats.totalEntries}</p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Food entries logged
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Achievement Badges */}
            {Object.entries(grouped).map(([category, categoryAchievements]) => (
                <div key={category} className="mb-8">
                    <h2 className="text-lg font-semibold mb-3">
                        {CATEGORY_LABELS[category] || category}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {categoryAchievements.map((achievement) => {
                            const isUnlocked = unlockedKeys.has(achievement.key);
                            const unlockedData = achievements.find(
                                (a) => a.achievement_key === achievement.key
                            );

                            return (
                                <Card
                                    key={achievement.key}
                                    className={`transition-all ${isUnlocked
                                        ? "shadow-sm hover:shadow-md border-primary/20"
                                        : "opacity-60"
                                        }`}
                                >
                                    <CardContent className="py-4 px-4">
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={`text-2xl ${!isUnlocked ? "grayscale" : ""
                                                    }`}
                                            >
                                                {isUnlocked ? achievement.icon : "🔒"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p
                                                        className={`font-medium text-sm ${!isUnlocked ? "text-muted-foreground" : ""
                                                            }`}
                                                    >
                                                        {achievement.label}
                                                    </p>
                                                    {isUnlocked && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-xs bg-green-500/10 text-green-600"
                                                        >
                                                            ✓
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {achievement.description}
                                                </p>
                                                {isUnlocked && unlockedData && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Unlocked{" "}
                                                        {new Date(
                                                            unlockedData.unlocked_at
                                                        ).toLocaleDateString()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
