"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Link2, AlertTriangle, Globe, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SynthesisResult } from "@/lib/knowledge-utils";
import type { ElementType } from "react";

interface SynthesisPanelProps {
  open: boolean;
  result: SynthesisResult;
  selectedNodes: { id: string; title: string }[];
  onClose: () => void;
}

function Section({
  icon: Icon,
  label,
  items,
  tint,
  numbered,
}: {
  icon: ElementType;
  label: string;
  items: string[];
  tint: string;
  numbered?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("rounded-lg p-3 space-y-2", tint)}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {numbered ? (
        <ol className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-current/60 shrink-0 font-mono">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SynthesisPanel({
  open,
  result,
  selectedNodes,
  onClose,
}: SynthesisPanelProps) {
  const titleMap = new Map(
    selectedNodes.map((n) => [n.title.trim().toLowerCase(), n.title])
  );
  const validLinks = result.suggested_links.filter(
    (l) =>
      titleMap.has(l.from.trim().toLowerCase()) &&
      titleMap.has(l.to.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Synthesis Insights
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pb-2">
          <Section
            icon={Link2}
            label="Connections"
            items={result.connections}
            tint="bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
          />

          {result.contradictions.length > 0 && (
            <Section
              icon={AlertTriangle}
              label="Contradictions"
              items={result.contradictions}
              tint="bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
            />
          )}

          <Section
            icon={Globe}
            label="Applications"
            items={result.applications}
            tint="bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
          />

          <Section
            icon={Sparkles}
            label="Insights"
            items={result.insights}
            tint="bg-purple-50 text-purple-900 dark:bg-purple-950/50 dark:text-purple-100"
          />

          {validLinks.length > 0 && (
            <div className="rounded-lg p-3 space-y-2 bg-slate-50 text-slate-900 dark:bg-slate-900/50 dark:text-slate-100">
              <div className="flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Suggested Links
                </span>
              </div>
              <ul className="space-y-2">
                {validLinks.map((link, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{link.from}</span>
                    <span className="text-slate-400 dark:text-slate-500 mx-1">→</span>
                    <span className="font-medium">{link.to}</span>
                    <span className="text-slate-500 dark:text-slate-400">: {link.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
