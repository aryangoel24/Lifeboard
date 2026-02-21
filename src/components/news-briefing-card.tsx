"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Newspaper, ExternalLink, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { generateNewsBriefing } from "@/lib/actions/learning";
import type { DailyContent, NewsTopic, NewsBriefingContent } from "@/types/learning";

const TOPIC_LABELS: Record<NewsTopic, string> = {
  tech: "Tech",
  finance: "Finance",
  general: "General",
  science: "Science",
  health: "Health",
};

const TOPIC_COLORS: Record<NewsTopic, string> = {
  tech: "border-blue-500",
  finance: "border-emerald-500",
  general: "border-amber-500",
  science: "border-purple-500",
  health: "border-rose-500",
};

interface NewsBriefingCardProps {
  initialContent: DailyContent | null;
  topics: NewsTopic[];
}

export function NewsBriefingCard({ initialContent, topics }: NewsBriefingCardProps) {
  const [content, setContent] = useState<DailyContent | null>(initialContent);
  const [isPending, startTransition] = useTransition();

  const briefing = content?.content as NewsBriefingContent | null;

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateNewsBriefing(topics, true);
      if (result) {
        setContent(result);
        toast.success("News briefing generated");
      } else {
        toast.error("Failed to generate news briefing");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="h-4 w-4 text-blue-500" />
          News Briefing
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          <span className="ml-1 hidden sm:inline">{content ? "Refresh" : "Generate"}</span>
        </Button>
      </CardHeader>
      <CardContent>
        {!briefing ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No briefing for today yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Generating…" : "Generate Now"}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue={briefing.briefings[0]?.topic ?? topics[0]}>
            <TabsList className="mb-3 flex-wrap h-auto gap-1">
              {briefing.briefings.map((b) => (
                <TabsTrigger key={b.topic} value={b.topic} className="text-xs">
                  {TOPIC_LABELS[b.topic]}
                </TabsTrigger>
              ))}
            </TabsList>
            {briefing.briefings.map((b) => (
              <TabsContent key={b.topic} value={b.topic} className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed italic border-b pb-3 mb-3">{b.summary}</p>
                {b.analysis && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Why it matters · </span>
                    {b.analysis}
                  </div>
                )}
                {b.continuing && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md px-3 py-2">
                    <ArrowUpRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <span><span className="font-medium">Evolving story · </span>{b.continuing}</span>
                  </div>
                )}
                {b.headlines.length > 0 && (
                  <div className="space-y-1">
                    {b.headlines.map((h, i) => (
                      <div
                        key={i}
                        className={`group border-l-[3px] ${TOPIC_COLORS[b.topic]} hover:bg-muted/40 transition-colors rounded-r-md pl-3 py-2`}
                      >
                        {h.url ? (
                          <a
                            href={h.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold leading-snug hover:underline flex items-start gap-1"
                          >
                            {h.title}
                            <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : (
                          <p className="text-sm font-semibold leading-snug">{h.title}</p>
                        )}
                        {h.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{h.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
