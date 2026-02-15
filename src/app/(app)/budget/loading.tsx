import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetLoading() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-56" />
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-9 w-24" />
                </div>
                <Skeleton className="h-4 w-full rounded-full" />
                <div className="flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-3 w-40" />
                    </div>
                ))}
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-6 w-12" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
