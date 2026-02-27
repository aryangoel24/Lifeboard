"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addChildNodes } from "@/lib/actions/knowledge";
import type { KnowledgeNode } from "@/types/database";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Loader2 } from "lucide-react";

interface SubtopicSuggestionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentNode: KnowledgeNode | null;
  suggestions: string[];
  existingChildTitles: string[];
  onAdded: (nodes: KnowledgeNode[]) => void;
}

export function SubtopicSuggestionSheet({
  open,
  onOpenChange,
  parentNode,
  suggestions,
  existingChildTitles,
  onAdded,
}: SubtopicSuggestionSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions)
  );
  const [customInput, setCustomInput] = useState("");
  const [customTitles, setCustomTitles] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const existingLower = new Set(existingChildTitles.map((t) => t.toLowerCase()));

  function toggleSuggestion(title: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomTitles((prev) => [...prev, trimmed]);
    setSelected((prev) => new Set([...Array.from(prev), trimmed]));
    setCustomInput("");
  }

  function handleAdd() {
    if (!parentNode) return;
    const aiSelected = suggestions.filter((s) => selected.has(s));
    const customSelected = customTitles.filter((s) => selected.has(s));
    const allSelected = [...aiSelected, ...customSelected];

    if (allSelected.length === 0) {
      toast.error("Select at least one subtopic to add");
      return;
    }

    startTransition(async () => {
      const aiTitles = aiSelected.filter(
        (t) => !existingLower.has(t.toLowerCase())
      );
      const manualTitles = customSelected.filter(
        (t) => !existingLower.has(t.toLowerCase())
      );

      const results = await Promise.allSettled([
        aiTitles.length > 0
          ? addChildNodes(parentNode.id, aiTitles, true)
          : Promise.resolve({ nodes: [] }),
        manualTitles.length > 0
          ? addChildNodes(parentNode.id, manualTitles, false)
          : Promise.resolve({ nodes: [] }),
      ]);

      const addedNodes: KnowledgeNode[] = [];
      let hasError = false;

      for (const r of results) {
        if (r.status === "fulfilled") {
          const val = r.value;
          if ("error" in val) {
            if (!val.error.includes("unique")) {
              hasError = true;
            }
          } else {
            addedNodes.push(...val.nodes);
          }
        } else {
          hasError = true;
        }
      }

      if (hasError) toast.error("Some subtopics could not be added");
      if (addedNodes.length > 0) {
        toast.success(`Added ${addedNodes.length} subtopic${addedNodes.length > 1 ? "s" : ""}`);
        onAdded(addedNodes);
      }
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[70vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>
            Expand: {parentNode?.title}
          </SheetTitle>
          <SheetDescription>
            Select subtopics to add. All AI suggestions are pre-selected.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 mb-4">
          {suggestions.map((title) => {
            const isDuplicate = existingLower.has(title.toLowerCase());
            const isSelected = selected.has(title);
            return (
              <button
                key={title}
                disabled={isDuplicate}
                onClick={() => toggleSuggestion(title)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-all",
                  isDuplicate
                    ? "opacity-40 cursor-not-allowed border-dashed"
                    : isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary"
                )}
              >
                {title}
                {isDuplicate && " (exists)"}
              </button>
            );
          })}
          {customTitles.map((title) => {
            const isDuplicate = existingLower.has(title.toLowerCase());
            const isSelected = selected.has(title);
            return (
              <button
                key={`custom-${title}`}
                disabled={isDuplicate}
                onClick={() => toggleSuggestion(title)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-all",
                  isDuplicate
                    ? "opacity-40 cursor-not-allowed border-dashed"
                    : isSelected
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "border-emerald-300 hover:border-emerald-500"
                )}
              >
                {title}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add custom subtopic…"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button variant="outline" size="icon" onClick={addCustom}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Add selected ({Array.from(selected).filter((s) => !existingLower.has(s.toLowerCase())).length})
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
