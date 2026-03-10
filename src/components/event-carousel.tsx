"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface EventCarouselProps {
    children: ReactNode[];
    /** Total number of slides (events) */
    count: number;
}

export function EventCarousel({ children, count }: EventCarouselProps) {
    const [index, setIndex] = useState(0);

    if (count <= 1) return <>{children}</>;

    return (
        <div className="relative">
            {/* Only render the active slide */}
            {children[index]}

            {/* Navigation footer */}
            <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-border/30">
                <button
                    onClick={() => setIndex((i) => (i - 1 + count) % count)}
                    className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Previous event"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5">
                    {Array.from({ length: count }).map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={`rounded-full transition-all ${i === index
                                ? "w-6 h-2 bg-primary"
                                : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                                }`}
                            aria-label={`Go to event ${i + 1}`}
                        />
                    ))}
                </div>

                <button
                    onClick={() => setIndex((i) => (i + 1) % count)}
                    className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Next event"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
