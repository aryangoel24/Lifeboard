"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/recipes", label: "Recipes" },
  { href: "/pantry", label: "Pantry" },
  { href: "/budget", label: "Budget" },
  { href: "/analytics", label: "Analytics" },
  { href: "/achievements", label: "Achievements" },
  { href: "/goals", label: "Goals" },
  { href: "/learn", label: "Learn" },
];

export { navItems };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export { ThemeToggle };

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 glass shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-xl">
            <span className="text-emerald-600 dark:text-emerald-400">Food</span>{" "}
            <span>Tracker</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm transition-all duration-200 px-3 py-1.5 rounded-full",
                  pathname === item.href
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              Log out
            </Button>
          </form>
        </div>
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
