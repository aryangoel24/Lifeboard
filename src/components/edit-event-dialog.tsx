"use client";

import { useState, useTransition } from "react";
import { updateEvent } from "@/lib/actions/events";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil } from "lucide-react";
import type { Event } from "@/types/database";

interface EditEventDialogProps {
    event: Partial<Event>;
}

export function EditEventDialog({ event }: EditEventDialogProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(event.title || "");
    const [summary, setSummary] = useState(event.summary || "");
    const [rawText, setRawText] = useState(event.raw_text || "");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        if (!event.id) return;
        setError(null);
        startTransition(async () => {
            const res = await updateEvent(event.id as string, {
                title,
                summary,
                raw_text: rawText,
            });
            if (!res.success) {
                setError(res.error || "Failed to update event");
            } else {
                setOpen(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit Memory</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {error && <div className="text-sm text-destructive">{error}</div>}

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Event title"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Raw Narrative</label>
                        <Textarea
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                            placeholder="What happened?"
                            className="min-h-[150px]"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">AI Summary</label>
                        <Textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder="Summary"
                            className="font-mono text-sm min-h-[100px]"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 pb-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
