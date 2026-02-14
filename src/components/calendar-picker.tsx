"use client";

import { Calendar } from "@/components/ui/calendar";
import { parseISO } from "date-fns";

interface CalendarPickerProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  datesWithEntries: string[];
}

export function CalendarPicker({
  selectedDate,
  onSelect,
  datesWithEntries,
}: CalendarPickerProps) {
  const entryDates = datesWithEntries.map((d) => parseISO(d));

  return (
    <Calendar
      mode="single"
      selected={selectedDate}
      onSelect={(date) => date && onSelect(date)}
      modifiers={{ hasEntry: entryDates }}
      modifiersClassNames={{
        hasEntry: "has-entry",
      }}
      className="rounded-md border"
    />
  );
}
