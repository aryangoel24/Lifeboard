import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-background to-background dark:from-emerald-950/20 dark:via-background dark:to-background">
      <Header />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
