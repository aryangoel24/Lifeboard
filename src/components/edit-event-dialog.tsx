"use client";

import { useState, useTransition } from "react";
import { updateEvent, deleteEvent } from "@/lib/actions/events";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { Event } from "@/types/database";

interface EditEventDialogProps {
    event: Partial<Event>;
}

export function EditEventDialog({ event }: EditEventDialogProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(event.title || "");
    const [rawText, setRawText] = useState(event.raw_text || "");
    const [happenedAt, setHappenedAt] = useState(event.happened_at ? new Date(event.happened_at).toISOString().split('T')[0] : "");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [isDeleting, setIsDeleting] = useState(false);

    const handleSave = () => {
        if (!event.id) return;
        setError(null);
        startTransition(async () => {
            const res = await updateEvent(event.id as string, {
                title,
                raw_text: rawText,
                ...(happenedAt ? { happened_at: new Date(happenedAt).toISOString() } : {})
            });
            if (!res.success) {
                setError(res.error || "Failed to update event");
            } else {
                setOpen(false);
            }
        });
    };

    const handleDelete = async () => {
        if (!event.id) return;
        if (!confirm("Are you sure you want to delete this memory? This cannot be undone.")) return;

        setError(null);
        setIsDeleting(true);
        const res = await deleteEvent(event.id as string);
        setIsDeleting(false);

        if (!res.success) {
            setError(res.error || "Failed to delete event");
        } else {
            setOpen(false);
        }
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Title</label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Event title"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Date</label>
                            <Input
                                type="date"
                                value={happenedAt}
                                onChange={(e) => setHappenedAt(e.target.value)}
                            />
                        </div>
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
                </div>
                <div className="flex justify-between items-center pb-2">
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isPending || isDeleting}
                        title="Delete this memory"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending || isDeleting}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isPending || isDeleting}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
