import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getFoodEntries,
  getEntriesForMonth,
} from "@/lib/actions/food-entries";
import { formatDate } from "@/lib/utils";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { CalendarClient } from "@/components/calendar-client";

interface CalendarPageProps {
  searchParams: { date?: string };
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const date = searchParams.date || formatDate(new Date());
  const selectedDate = new Date(date + "T00:00:00");

  const [entries, datesWithEntries, profileResult] = await Promise.all([
    getFoodEntries(date),
    getEntriesForMonth(selectedDate.getFullYear(), selectedDate.getMonth() + 1),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  const profile = profileResult.data;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-8">Calendar</h1>
      <div className="grid gap-8 md:grid-cols-[auto_1fr]">
        <div>
          <CalendarClient
            selectedDate={date}
            datesWithEntries={datesWithEntries}
          />
        </div>
        <div className="space-y-6">
          {profile && <DailySummary entries={entries} profile={profile} />}
          <FoodEntryList entries={entries} userId={user.id} date={date} />
        </div>
      </div>
    </div>
  );
}
