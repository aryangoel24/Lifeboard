"use client";

import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/components/calendar-picker";
import { formatDate, formatDisplayDate } from "@/lib/utils";

interface CalendarClientProps {
  selectedDate: string;
  datesWithEntries: string[];
  caloriesByDay?: Record<string, number>;
  calorieGoal?: number;
}

export function CalendarClient({
  selectedDate,
  datesWithEntries,
  caloriesByDay,
  calorieGoal,
}: CalendarClientProps) {
  const router = useRouter();
  const date = new Date(selectedDate + "T00:00:00");

  function handleSelect(newDate: Date) {
    router.push(`/calendar?date=${formatDate(newDate)}`);
  }

  return (
    <div className="space-y-2">
      <CalendarPicker
        selectedDate={date}
        onSelect={handleSelect}
        datesWithEntries={datesWithEntries}
        caloriesByDay={caloriesByDay}
        calorieGoal={calorieGoal}
      />
      <p className="text-sm text-muted-foreground text-center">
        {formatDisplayDate(selectedDate)}
      </p>
    </div>
  );
}
