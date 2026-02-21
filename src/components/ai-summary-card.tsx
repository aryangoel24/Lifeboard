"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, Lightbulb, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { generateAISummary } from "@/lib/actions/learning";
import type { DailyContent, NewsTopic, AISummaryContent } from "@/types/learning";

interface AISummaryCardProps {
  initialContent: DailyContent | null;
  topics: NewsTopic[];
}

export function AISummaryCard({ initialContent, topics }: AISummaryCardProps) {
  const [content, setContent] = useState<DailyContent | null>(initialContent);
  const [isPending, startTransition] = useTransition();

  const summary = content?.content as AISummaryContent | null;

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateAISummary(topics, true);
      if (result) {
        setContent(result);
        toast.success("Summary generated");
      } else {
        toast.error("Failed to generate summary");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-purple-500" />
          AI Daily Summary
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          <span className="ml-1 hidden sm:inline">{summary ? "Regenerate" : "Generate"}</span>
        </Button>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No summary for today yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Generating…" : "Generate Now"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                Today&apos;s Overview
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-muted-foreground/20 pl-3">
                {summary.summary}
              </p>
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">✦ Fun Fact</p>
              <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{summary.fun_fact}</p>
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-3 space-y-1">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Lightbulb className="h-3 w-3" />
                Learning Tip
              </p>
              <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">{summary.learning_tip}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
