import { Skeleton } from "@/components/ui/skeleton";

export default function GoalsLoading() {
    return (
        <div className="max-w-lg mx-auto space-y-6">
            <Skeleton className="h-8 w-32" />
            <div className="rounded-lg border bg-card p-6 space-y-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                ))}
                <Skeleton className="h-10 w-full rounded-md" />
            </div>
        </div>
    );
}
