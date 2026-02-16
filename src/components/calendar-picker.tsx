"use client";

import { Calendar } from "@/components/ui/calendar";
import { parseISO } from "date-fns";

interface CalendarPickerProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  datesWithEntries: string[];
  caloriesByDay?: Record<string, number>;
  calorieGoal?: number;
}

export function CalendarPicker({
  selectedDate,
  onSelect,
  datesWithEntries,
  caloriesByDay,
  calorieGoal,
}: CalendarPickerProps) {
  const entryDates = datesWithEntries.map((d) => parseISO(d));

  // Color-code dates based on calorie goal adherence
  const goalHitDates: Date[] = [];
  const goalCloseDates: Date[] = [];
  const goalMissedDates: Date[] = [];

  if (caloriesByDay && calorieGoal) {
    for (const [dateStr, calories] of Object.entries(caloriesByDay)) {
      const d = parseISO(dateStr);
      const ratio = calories / calorieGoal;
      if (ratio >= 0.8 && ratio <= 1.1) {
        goalHitDates.push(d);
      } else if (ratio >= 0.5 && ratio < 0.8) {
        goalCloseDates.push(d);
      } else {
        goalMissedDates.push(d);
      }
    }
  }

  const useColorCoding = caloriesByDay && calorieGoal;

  return (
    <Calendar
      mode="single"
      selected={selectedDate}
      onSelect={(date) => date && onSelect(date)}
      modifiers={{
        hasEntry: entryDates,
        ...(useColorCoding
          ? {
              goalHit: goalHitDates,
              goalClose: goalCloseDates,
              goalMissed: goalMissedDates,
            }
          : {}),
      }}
      modifiersClassNames={{
        hasEntry: "has-entry",
        ...(useColorCoding
          ? {
              goalHit: "calendar-goal-hit",
              goalClose: "calendar-goal-close",
              goalMissed: "calendar-goal-missed",
            }
          : {}),
      }}
      className="rounded-md border"
    />
  );
}
