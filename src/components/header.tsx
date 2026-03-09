"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sun, Moon, ChevronDown } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const navGroups = [
  {
    label: "Dashboard",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    label: "Journal",
    items: [{ href: "/journal", label: "Journal" }],
  },
  {
    label: "Food",
    items: [
      { href: "/calendar", label: "Calendar" },
      { href: "/recipes", label: "Recipes" },
      { href: "/pantry", label: "Pantry" },
    ],
  },
  {
    label: "Finance",
    items: [{ href: "/budget", label: "Budget" }],
  },
  {
    label: "Progress",
    items: [
      { href: "/goals", label: "Goals" },
      { href: "/analytics", label: "Analytics" },
      { href: "/achievements", label: "Achievements" },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/learn", label: "News" },
      { href: "/learn/hub", label: "Knowledge Hub" },
      { href: "/learn/digest", label: "Daily Digest" },
      { href: "/learn/extract", label: "Extract" },
    ],
  },
];

export { navGroups };

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
            <span className="text-emerald-600 dark:text-emerald-400">Life</span>
            <span>board</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navGroups.map((group) => {
              const isGroupActive = group.items.some(
                (item) => pathname === item.href
              );
              if (group.items.length === 1) {
                const item = group.items[0];
                return (
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
                );
              }
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1 text-sm transition-all duration-200 px-3 py-1.5 rounded-full",
                        isGroupActive
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {group.label}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            pathname === item.href &&
                            "text-emerald-700 dark:text-emerald-400 font-medium"
                          )}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
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
