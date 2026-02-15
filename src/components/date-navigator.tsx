"use client";

import { useRouter } from "next/navigation";
import { addDays, subDays, isToday, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { formatDate, formatDisplayDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateNavigatorProps {
  date: string;
}

export function DateNavigator({ date }: DateNavigatorProps) {
  const router = useRouter();
  const currentDate = parseISO(date);
  const today = isToday(currentDate);

  function navigate(newDate: Date) {
    router.push(`/dashboard?date=${formatDate(newDate)}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-accent"
        onClick={() => navigate(subDays(currentDate, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-center min-w-[140px]">
        <p className="text-sm font-medium text-foreground">{formatDisplayDate(date)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-accent"
        onClick={() => navigate(addDays(currentDate, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!today && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 rounded-full px-3 border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => navigate(new Date())}
        >
          Today
        </Button>
      )}
    </div>
  );
}
