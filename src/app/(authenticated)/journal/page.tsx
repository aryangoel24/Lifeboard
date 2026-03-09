import { getEvents } from "@/lib/actions/events";
import { format } from "date-fns";
import { MapPin, Users, BrainCircuit, Clock } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Journal | Lifeboard",
    description: "Your episodic memory timeline.",
};

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

    return (
        <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
            <div className="mb-8 relative">
                <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                    <BookOpenIcon className="w-10 h-10 text-primary/80" />
                    Journal
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">Your episodic memory timeline.</p>
            </div>

            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {!events?.length ? (
                    <div className="text-center py-20 relative z-10 glass rounded-2xl">
                        <h3 className="text-xl font-semibold mb-2">Your journal is empty</h3>
                        <p className="text-muted-foreground">
                            Send a message to your Telegram bot describing your day to create your first entry.
                        </p>
                    </div>
                ) : (
                    events.map((event) => (
                        <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            {/* Timeline dot */}
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                <Clock className="w-4 h-4 text-primary-foreground" />
                            </div>

                            {/* Card */}
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-bold text-xl">{event.title}</h3>
                                    {event.happened_at && (
                                        <time className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                            {event.time_precision === 'approximate' && '~'}
                                            {format(new Date(event.happened_at), "MMM d, yyyy")}
                                        </time>
                                    )}
                                </div>

                                <div className="prose prose-sm dark:prose-invert text-muted-foreground line-clamp-3 mb-4">
                                    {event.raw_text}
                                </div>

                                {/* AI Summary view */}
                                <div className="bg-muted/50 rounded-lg p-3 text-sm border border-border/50 mb-4">
                                    <span className="font-semibold text-xs text-foreground/70 uppercase tracking-widest mb-1 block">AI Summary</span>
                                    {event.summary}
                                </div>

                                {/* Metadata Tags */}
                                <div className="flex flex-wrap gap-2 mt-4">
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
                                </div>

                                {/* Links */}
                                {(event.event_knowledge_links?.length ?? 0) > 0 && (
                                    <div className="mt-4 pt-4 border-t border-border/50">
                                        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            <BrainCircuit className="w-3.5 h-3.5" />
                                            Linked Knowledge
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {/* Note: In a real app we'd join table to fetch node titles. 
                          For now, just linking ID as an example or fetching via nested select in action, 
                          but the action only selects node_id. We'll show a generic badge for now to reflect the architecture. */}
                                            {event.event_knowledge_links?.map((link: { node_id: string; why: string | null }, idx: number) => (
                                                <Link
                                                    href={"/learn/hub"}
                                                    key={idx}
                                                    className="text-xs hover:bg-muted bg-background border px-2 py-1 rounded-md transition-colors"
                                                >
                                                    Node Ref
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
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
