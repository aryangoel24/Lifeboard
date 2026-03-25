import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/actions/goals";
import { GoalsForm } from "@/components/goals-form";
import { ApiTokenCard } from "@/components/api-token-card";
import { BuiltinHabitsCard } from "@/components/builtin-habits-card";
import { ManageHabits } from "@/components/manage-habits";
import { getAllCustomHabits } from "@/lib/actions/custom-habits";

export default async function GoalsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const [profile, customHabits] = await Promise.all([
    getProfile(),
    getAllCustomHabits(),
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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Daily Goals</h1>
      <GoalsForm profile={profile} />
      <BuiltinHabitsCard profile={profile} />
      <ManageHabits habits={customHabits} />
      <ApiTokenCard
        hasToken={!!profile.api_token_hash}
        apiEnabled={profile.api_enabled}
      />
    </div>
  );
}
