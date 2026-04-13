import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFoodEntries } from "@/lib/actions/food-entries";
import { getStreaks } from "@/lib/actions/achievements";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { getPantryItems } from "@/lib/actions/pantry";
import { getWeightEntries } from "@/lib/actions/weight";
import { getTodayHabits, getHabitEntries } from "@/lib/actions/habits";
import { getCustomHabits, getTodayCustomHabitEntries, getCustomHabitEntries } from "@/lib/actions/custom-habits";
import { computeAndUpdateDebt, getDebtState } from "@/lib/actions/habit-debt";
import { getTodaySteps } from "@/lib/actions/steps";
import { getToday, getNow } from "@/lib/timezone";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { DateNavigator } from "@/components/date-navigator";
import { StreakWidget } from "@/components/streak-widget";
import { QuickTemplates } from "@/components/quick-templates";
import { WeightLogCard } from "@/components/weight-log-card";
import { StepCard } from "@/components/step-card";
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
  const today = getToday();

  // Fire debt computation for yesterday (non-blocking for today's view)
  // We don't await it here — it runs alongside other fetches
  const debtComputePromise = computeAndUpdateDebt(today);

  const [entries, profileResult, streaks, templates, recentWeights, todayHabits, customHabits, customHabitEntries, weeklyHabitEntries, weeklyCustomHabitEntries, todaySteps, pantryItems] =
    await Promise.all([
      getFoodEntries(date),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getStreaks(),
      getMealTemplates(),
      getWeightEntries(7),
      getTodayHabits(date),
      getCustomHabits(),
      getTodayCustomHabitEntries(date),
      getHabitEntries(7),
      getCustomHabitEntries(7),
      getTodaySteps(date),
      getPantryItems(),
    ]);

  // Wait for debt computation to complete, then fetch state
  await debtComputePromise;
  const debtState = await getDebtState();

  const todayWeight = recentWeights.find((w) => w.logged_at === date) ?? null;

  const profile = profileResult.data;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <StreakWidget streaks={streaks} />
          </div>
          <DateNavigator date={date} />
        </div>
        <AddEntryDialog userId={user.id} date={date} pantryItems={pantryItems} />
      </div>

      {profile && (
        <DailySummary
          entries={entries}
          profile={profile}
          showMealGaps={date === getToday()}
          currentHour={getNow().getHours()}
        />
      )}

      {/* Primary Logs (Side-by-side on md+ screens) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <WeightLogCard
          key={`weight-${date}`}
          todayWeight={todayWeight}
          recentEntries={recentWeights}
          goalWeight={profile?.goal_weight ?? null}
          date={date}
        />

        <StepCard todaySteps={todaySteps} />
      </div>

      {/* Daily Habits */}
      {profile && (
        <HabitsSection
          date={date}
          today={today}
          profile={profile}
          todayHabits={todayHabits}
          customHabits={customHabits}
          customHabitEntries={customHabitEntries}
          weeklyHabitEntries={weeklyHabitEntries}
          weeklyCustomHabitEntries={weeklyCustomHabitEntries}
          debts={debtState.debts}
          currentWeekTotalCents={debtState.currentWeekTotalCents}
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
