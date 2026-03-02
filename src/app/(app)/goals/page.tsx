import { createClient } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GoalsForm } from "@/components/goals-form";
import { ApiTokenCard } from "@/components/api-token-card";
import { BuiltinHabitsCard } from "@/components/builtin-habits-card";
import { ManageHabits } from "@/components/manage-habits";
import { GoalsAccountabilitySection } from "@/components/goals-accountability-section";
import { getAllCustomHabits } from "@/lib/actions/custom-habits";
import { getDebtState } from "@/lib/actions/habit-debt";
import { getToday } from "@/lib/timezone";

export default async function GoalsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const today = getToday();

  const [supabaseResult, customHabits, debtState] = await Promise.all([
    (async () => {
      const supabase = createClient();
      return supabase.from("profiles").select("*").eq("id", userId).single();
    })(),
    getAllCustomHabits(),
    getDebtState(),
  ]);

  const profile = supabaseResult.data;

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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Daily Goals</h1>
      <GoalsForm profile={profile} />
      <BuiltinHabitsCard profile={profile} />
      <ManageHabits habits={customHabits} />
      <GoalsAccountabilitySection
        debts={debtState.debts}
        meta={debtState.meta}
        unsettledMonths={debtState.unsettledMonths}
        customHabits={customHabits}
        liveMonthChargedCents={debtState.liveMonthChargedCents}
        liveMonthForgivenCents={debtState.liveMonthForgivenCents}
        today={today}
      />
      <ApiTokenCard
        hasToken={!!profile.api_token_hash}
        apiEnabled={profile.api_enabled}
      />
    </div>
  );
}
