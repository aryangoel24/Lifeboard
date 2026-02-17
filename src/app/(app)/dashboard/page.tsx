import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFoodEntries } from "@/lib/actions/food-entries";
import { getStreaks } from "@/lib/actions/achievements";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { getWeightEntries } from "@/lib/actions/weight";
import { getTodayHabits } from "@/lib/actions/habits";
import { getCustomHabits, getTodayCustomHabitEntries } from "@/lib/actions/custom-habits";
import { getToday } from "@/lib/timezone";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { DateNavigator } from "@/components/date-navigator";
import { StreakWidget } from "@/components/streak-widget";
import { QuickTemplates } from "@/components/quick-templates";
import { WeightLogCard } from "@/components/weight-log-card";
import { HabitsSection } from "@/components/habits-section";

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

  const date = searchParams.date || getToday();

  const [entries, profileResult, streaks, templates, recentWeights, todayHabits, customHabits, customHabitEntries] =
    await Promise.all([
      getFoodEntries(date),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getStreaks(),
      getMealTemplates(),
      getWeightEntries(7),
      getTodayHabits(date),
      getCustomHabits(),
      getTodayCustomHabitEntries(date),
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

      {profile && (
        <DailySummary
          entries={entries}
          profile={profile}
          showMealGaps={date === getToday()}
        />
      )}

      <WeightLogCard
        key={date}
        todayWeight={todayWeight}
        recentEntries={recentWeights}
        goalWeight={profile?.goal_weight ?? null}
        date={date}
      />

      {/* Daily Habits */}
      {profile && (
        <HabitsSection
          date={date}
          profile={profile}
          todayHabits={todayHabits}
          customHabits={customHabits}
          customHabitEntries={customHabitEntries}
        />
      )}

      {/* Quick Templates Bar */}
      {templates.length > 0 && (
        <QuickTemplates templates={templates.slice(0, 5)} date={date} />
      )}

      <FoodEntryList entries={entries} userId={user.id} date={date} />
    </div>
  );
}
