"use client";

import { useState, useTransition, useRef } from "react";
import { ingestEvent } from "@/lib/actions/events";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X, ImagePlus, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AddJournalEntryDialogProps {
    userId: string;
}

interface QueuedPhoto {
    file: File;
    preview: string;
}

export function AddJournalEntryDialog({ userId }: AddJournalEntryDialogProps) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isPending, startTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = (files: File[]) => {
        const newPhotos = files
            .filter((f) => f.size <= 5 * 1024 * 1024)
            .map((file) => ({ file, preview: URL.createObjectURL(file) }));
        setPhotos((prev) => [...prev, ...newPhotos]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        addFiles(Array.from(e.target.files ?? []));
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isPending) return;
        const files = Array.from(e.dataTransfer.files).filter(
            (f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type)
        );
        addFiles(files);
    };

    const removePhoto = (index: number) => {
        setPhotos((prev) => {
            URL.revokeObjectURL(prev[index].preview);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = () => {
        if (text.trim().length < 3) return;

        startTransition(async () => {
            const supabase = createClient();
            const storagePaths: string[] = [];

            for (const { file } of photos) {
                const ext = file.name.split(".").pop() ?? "jpg";
                const path = `${userId}/${crypto.randomUUID()}.${ext}`;
                const { error } = await supabase.storage
                    .from("food-photos")
                    .upload(path, file, { contentType: file.type });
                if (!error) storagePaths.push(path);
            }

            const media = storagePaths.map((p) => ({ type: "photo" as const, storagePath: p }));
            const overrideDate = date ? format(date, "yyyy-MM-dd") : undefined;
            const result = await ingestEvent(
                text.trim(),
                "manual",
                undefined,
                media.length > 0 ? media : undefined,
                overrideDate
            );

            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success("Entry saved");
                setOpen(false);
                setText("");
                photos.forEach((p) => URL.revokeObjectURL(p.preview));
                setPhotos([]);
                setDate(undefined);
            }
        });
    };

    const handleOpenChange = (val: boolean) => {
        if (!isPending) {
            setOpen(val);
            if (!val) {
                setText("");
                photos.forEach((p) => URL.revokeObjectURL(p.preview));
                setPhotos([]);
                setDate(undefined);
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New Entry
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>New Journal Entry</DialogTitle>
                </DialogHeader>
                <div
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="relative"
                >
                    {isDragging && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 pointer-events-none">
                            <p className="text-sm font-medium text-primary">Drop photos here</p>
                        </div>
                    )}
                <div className="space-y-4 py-2">
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Describe your day, a conversation, a memory…"
                        className="min-h-[160px] resize-none"
                        disabled={isPending}
                    />

                    <div className="flex items-center gap-3">
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isPending}
                                    className={cn("gap-1.5 text-sm font-normal", !date && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="h-4 w-4" />
                                    {date ? format(date, "MMM d, yyyy") : "Pick a date (optional)"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                                    disabled={(d) => d > new Date()}
                                    initialFocus
                                />
                                {date && (
                                    <div className="border-t px-3 py-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-muted-foreground"
                                            onClick={() => { setDate(undefined); setCalendarOpen(false); }}
                                        >
                                            Clear date
                                        </Button>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>
                        {!date && (
                            <span className="text-xs text-muted-foreground">
                                Date will be inferred from your text if not set.
                            </span>
                        )}
                    </div>

                    {photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {photos.map((photo, i) => (
                                <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(i)}
                                        disabled={isPending}
                                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-5 w-5 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isPending}
                    />
                </div>

                <div className="flex justify-between items-center pb-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isPending}
                        className="gap-1.5"
                    >
                        <ImagePlus className="h-4 w-4" />
                        Add Photos
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={isPending || text.trim().length < 3}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isPending ? "Saving…" : "Save Entry"}
                        </Button>
                    </div>
                </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
