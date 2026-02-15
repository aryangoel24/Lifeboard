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
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                <span>Quick Add</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {templates.map((template) => (
                    <Button
                        key={template.id}
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap shrink-0 text-xs"
                        onClick={() => handleLog(template.id)}
                    >
                        {template.name}
                        <span className="text-muted-foreground ml-1">
                            {template.calories}cal
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
