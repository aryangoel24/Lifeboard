import { Skeleton } from "@/components/ui/skeleton";

export default function PantryLoading() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-16 rounded-full" />
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-20" />
                        <div className="grid grid-cols-4 gap-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
