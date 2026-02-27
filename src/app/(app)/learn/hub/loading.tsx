export default function KnowledgeHubLoading() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Loading your knowledge graph…</span>
      </div>
    </div>
  );
}
