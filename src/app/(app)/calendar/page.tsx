import { redirect } from "next/navigation";
import { getCalendarData } from "@/lib/actions/calendar";
import { getToday } from "@/lib/timezone";
import { getAuthUserId } from "@/lib/auth";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { CalendarClient } from "@/components/calendar-client";

interface CalendarPageProps {
  searchParams: { date?: string };
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const date = searchParams.date || getToday();
  const selectedDate = new Date(date + "T00:00:00");
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth() + 1;

  const { entries, datesWithEntries, caloriesByDay, profile } =
    await getCalendarData(year, month, date);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Calendar</h1>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div>
          <CalendarClient
            selectedDate={date}
            datesWithEntries={datesWithEntries}
            caloriesByDay={caloriesByDay}
            calorieGoal={profile?.daily_calories_goal}
          />
        </div>
        <div className="space-y-6">
          {profile && <DailySummary entries={entries} profile={profile} />}
          <FoodEntryList entries={entries} userId={userId} date={date} />
        </div>
      </div>
    </div>
  );
}
