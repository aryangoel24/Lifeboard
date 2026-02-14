import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFoodEntries } from "@/lib/actions/food-entries";
import { formatDate } from "@/lib/utils";
import { FoodEntryList } from "@/components/food-entry-list";
import { DailySummary } from "@/components/daily-summary";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { DateNavigator } from "@/components/date-navigator";

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
  const entries = await getFoodEntries(date);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <DateNavigator date={date} />
        </div>
        <AddEntryDialog userId={user.id} date={date} />
      </div>

      {profile && <DailySummary entries={entries} profile={profile} />}

      <FoodEntryList entries={entries} userId={user.id} date={date} />
    </div>
  );
}
