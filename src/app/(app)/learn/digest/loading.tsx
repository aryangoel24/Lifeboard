export default function DigestLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      <div className="space-y-2">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>
      <div className="space-y-3">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
        <div className="flex gap-2 justify-end">
          <div className="h-9 w-24 bg-muted animate-pulse rounded" />
          <div className="h-9 w-20 bg-muted animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
