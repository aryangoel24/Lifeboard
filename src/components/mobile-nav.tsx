"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle, navItems } from "@/components/header";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64 glass border-l-0">
        <SheetHeader>
          <SheetTitle className="text-left">
            <span className="text-emerald-600 dark:text-emerald-400">Food</span>{" "}
            <span>Tracker</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm transition-all duration-200",
                pathname === item.href
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between mt-6 px-3">
          <span className="text-sm text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <div className="mt-6 px-3">
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" className="w-full">
              Log out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
