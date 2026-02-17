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
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, gi) => (
                    <div key={gi} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-6" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from({ length: gi === 0 ? 3 : 2 }).map((_, i) => (
                                <div key={i} className="glass-card rounded-2xl border-l-[3px] border-l-muted p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-4 w-28" />
                                        <div className="flex gap-1">
                                            <Skeleton className="h-7 w-7 rounded" />
                                            <Skeleton className="h-7 w-7 rounded" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
