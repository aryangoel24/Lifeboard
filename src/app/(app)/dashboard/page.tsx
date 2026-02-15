import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFoodEntries } from "@/lib/actions/food-entries";
import { getStreaks } from "@/lib/actions/achievements";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { getWeightEntries } from "@/lib/actions/weight";
import { formatDate } from "@/lib/utils";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { DateNavigator } from "@/components/date-navigator";
import { StreakWidget } from "@/components/streak-widget";
import { QuickTemplates } from "@/components/quick-templates";
import { WeightLogCard } from "@/components/weight-log-card";

interface DashboardPageProps {
  searchParams: { date?: string };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const date = searchParams.date || formatDate(new Date());

  const [entries, profileResult, streaks, templates, recentWeights] =
    await Promise.all([
      getFoodEntries(date),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getStreaks(),
      getMealTemplates(),
      getWeightEntries(7),
    ]);

  const todayWeight = recentWeights.find((w) => w.logged_at === date) ?? null;

  const profile = profileResult.data;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <StreakWidget streaks={streaks} />
          </div>
          <DateNavigator date={date} />
        </div>
        <AddEntryDialog userId={user.id} date={date} />
      </div>

      {profile && <DailySummary entries={entries} profile={profile} />}

      <WeightLogCard
        key={date}
        todayWeight={todayWeight}
        recentEntries={recentWeights}
        goalWeight={profile?.goal_weight ?? null}
        date={date}
      />

      {/* Quick Templates Bar */}
      {templates.length > 0 && (
        <QuickTemplates templates={templates.slice(0, 5)} date={date} />
      )}

      <FoodEntryList entries={entries} userId={user.id} date={date} />
    </div>
  );
}
