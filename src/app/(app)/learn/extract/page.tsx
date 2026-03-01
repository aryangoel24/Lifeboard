import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExtractClient } from "@/components/extract-client";

export default async function ExtractPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ExtractClient />;
}
