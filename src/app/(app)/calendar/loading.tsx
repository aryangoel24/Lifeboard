import { Skeleton } from "@/components/ui/skeleton";
import { FoodEntryListSkeleton } from "@/components/food-entry-list-skeleton";

export default function CalendarLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32 mb-6" />
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <Skeleton className="h-[300px] w-[280px] rounded-md" />
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
          <FoodEntryListSkeleton />
        </div>
      </div>
    </div>
  );
}
