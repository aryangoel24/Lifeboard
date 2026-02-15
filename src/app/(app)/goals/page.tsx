import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoalsForm } from "@/components/goals-form";

export default async function GoalsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Daily Goals</h1>
      <GoalsForm profile={profile} />
    </div>
  );
}
