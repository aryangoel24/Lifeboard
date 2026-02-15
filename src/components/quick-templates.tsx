"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { logFromTemplate } from "@/lib/actions/meal-templates";
import type { MealTemplate } from "@/types/database";

interface QuickTemplatesProps {
    templates: MealTemplate[];
    date: string;
}

export function QuickTemplates({ templates, date }: QuickTemplatesProps) {
    async function handleLog(templateId: string) {
        const result = await logFromTemplate(templateId, date);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Logged from template!");
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span>Quick Add</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                {templates.map((template) => (
                    <Button
                        key={template.id}
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap shrink-0 text-xs rounded-full border-border/60 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
                        onClick={() => handleLog(template.id)}
                    >
                        {template.name}
                        <span className="text-muted-foreground ml-1.5 font-mono">
                            {template.calories}cal
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
