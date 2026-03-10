import { getEvents } from "@/lib/actions/events";
import { format } from "date-fns";
import { MapPin, Users, BrainCircuit, Clock, Mic } from "lucide-react";
import Link from "next/link";
import { EditEventDialog } from "@/components/edit-event-dialog";
import { ExpandableText } from "@/components/expandable-text";
import { PhotoCarousel } from "@/components/photo-carousel";
import { EventCarousel } from "@/components/event-carousel";

export const metadata = {
    title: "Journal | Lifeboard",
    description: "Your episodic memory timeline.",
};

type Event = NonNullable<Awaited<ReturnType<typeof getEvents>>["data"]>[number];

function getDay(event: Event): string {
    return event.happened_at?.substring(0, 10) ?? "unknown";
}

export default async function JournalPage() {
    const { data: events, error } = await getEvents();

    if (error) {
        return (
            <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                    Failed to load journal: {error}
                </div>
            </div>
        );
    }

    // Group events by day, preserving sort order (newest first within each day too)
    const grouped = new Map<string, Event[]>();
    for (const event of events ?? []) {
        const day = getDay(event);
        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day)!.push(event);
    }
    const sortedDays = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                    <BookOpenIcon className="w-10 h-10 text-primary/80" />
                    Journal
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">Your episodic memory timeline.</p>
            </div>

            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {sortedDays.length === 0 ? (
                    <div className="text-center py-20 relative z-10 glass rounded-2xl">
                        <h3 className="text-xl font-semibold mb-2">Your journal is empty</h3>
                        <p className="text-muted-foreground">
                            Send a message to your Telegram bot describing your day to create your first entry.
                        </p>
                    </div>
                ) : (
                    sortedDays.map((day) => {
                        const dayEvents = grouped.get(day)!;
                        const displayDate = day !== "unknown"
                            ? format(new Date(day + "T12:00:00"), "MMM d, yyyy")
                            : "Unknown date";

                        return (
                            <div key={day} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                {/* Timeline dot */}
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 mt-1">
                                    <Clock className="w-4 h-4 text-primary-foreground" />
                                </div>

                                {/* Day card */}
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
                                    {/* Date header */}
                                    <div className="px-5 py-3 border-b border-border/50 bg-muted/30">
                                        <time className="text-sm font-semibold text-muted-foreground">{displayDate}</time>
                                    </div>

                                    {/* Events within the day — carousel if multiple */}
                                    <EventCarousel count={dayEvents.length}>
                                        {dayEvents.map((event) => {
                                            const photos = (event.event_media ?? []).filter(
                                                (m: { type: string; signed_url?: string }) => m.type === "photo" && m.signed_url
                                            ) as { id: string; signed_url: string }[];
                                            const audios = (event.event_media ?? []).filter(
                                                (m: { type: string; signed_url?: string }) => m.type === "audio" && m.signed_url
                                            ) as { id: string; signed_url: string }[];

                                            return (
                                                <div key={event.id} className="p-5 group/event">
                                                    {/* Title row */}
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-base leading-snug flex-1">{event.title}</h3>
                                                        <div className="opacity-0 group-hover/event:opacity-100 transition-opacity shrink-0">
                                                            <EditEventDialog event={event} />
                                                        </div>
                                                    </div>

                                                    {/* Description */}
                                                    <div className="mt-2">
                                                        <ExpandableText text={event.raw_text || ""} />
                                                    </div>

                                                    {/* Photo carousel */}
                                                    {photos.length > 0 && (
                                                        <div className="mt-3">
                                                            <PhotoCarousel photos={photos} />
                                                        </div>
                                                    )}

                                                    {/* Audio */}
                                                    {audios.map((a) => (
                                                        <audio key={a.id} controls src={a.signed_url} className="w-full h-10 mt-3" />
                                                    ))}

                                                    {/* Metadata tags */}
                                                    <div className="flex flex-wrap gap-2 mt-3">
                                                        {(event.extracted_people?.length ?? 0) > 0 && (
                                                            <div className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-medium">
                                                                <Users className="w-3.5 h-3.5" />
                                                                {event.extracted_people?.join(", ")}
                                                            </div>
                                                        )}
                                                        {(event.extracted_places?.length ?? 0) > 0 && (
                                                            <div className="flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full font-medium">
                                                                <MapPin className="w-3.5 h-3.5" />
                                                                {event.extracted_places?.join(", ")}
                                                            </div>
                                                        )}
                                                        {event.source === "telegram_voice" && (
                                                            <div className="flex items-center gap-1.5 text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400 px-2.5 py-1 rounded-full font-medium">
                                                                <Mic className="w-3.5 h-3.5" />
                                                                Transcribed Voice Note
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Knowledge links */}
                                                    {(event.event_knowledge_links?.length ?? 0) > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-border/40">
                                                            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                                <BrainCircuit className="w-3.5 h-3.5" />
                                                                Linked Knowledge
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {event.event_knowledge_links?.map((link: { node_id: string; why: string | null; knowledge_nodes?: { title: string } | null }, idx: number) => (
                                                                    <Link
                                                                        href={`/learn/hub?nodeId=${link.node_id}`}
                                                                        key={idx}
                                                                        className="text-xs hover:bg-muted bg-background border px-2 py-1 rounded-md transition-colors text-indigo-600 dark:text-indigo-400 font-medium"
                                                                    >
                                                                        {link.knowledge_nodes?.title || "Node Ref"}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </EventCarousel>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function BookOpenIcon(props: React.ComponentProps<"svg">) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
    );
}
