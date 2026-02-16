import { createClient } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GoalsForm } from "@/components/goals-form";
import { ApiTokenCard } from "@/components/api-token-card";
import { getGoalAchievementRate } from "@/lib/actions/goals";
import { getStreaks } from "@/lib/actions/achievements";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Flame, Beef } from "lucide-react";

export default async function GoalsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const [{ data: profile }, goalRate, streaks] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    getGoalAchievementRate(30),
    getStreaks(),
  ]);

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-6">Daily Goals</h1>
        <p className="text-muted-foreground text-center py-8">
          No profile found. Please complete your profile setup.
        </p>
      </div>
    );
  }

  const loggingStreak = streaks.find((s) => s.streak_type === "logging");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Daily Goals</h1>

      {/* Goal Achievement Summary */}
      {goalRate.totalDays > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <Target className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <p className="text-xl font-bold">
                {goalRate.daysHitCalories}/{goalRate.totalDays}
              </p>
              <p className="text-xs text-muted-foreground">Cal goal hit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <Beef className="h-4 w-4 mx-auto text-blue-500 mb-1" />
              <p className="text-xl font-bold">
                {goalRate.daysHitProtein}/{goalRate.totalDays}
              </p>
              <p className="text-xs text-muted-foreground">Protein goal hit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <Flame className="h-4 w-4 mx-auto text-orange-500 mb-1" />
              <p className="text-xl font-bold">
                {loggingStreak?.current_count || 0}
              </p>
              <p className="text-xs text-muted-foreground">Day streak</p>
            </CardContent>
          </Card>
        </div>
      )}

      <GoalsForm profile={profile} />
      <ApiTokenCard
        hasToken={!!profile.api_token_hash}
        apiEnabled={profile.api_enabled}
      />
    </div>
  );
}
