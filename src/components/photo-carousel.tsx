"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PhotoCarouselProps {
    photos: { id: string; signed_url: string }[];
}

export function PhotoCarousel({ photos }: PhotoCarouselProps) {
    const [index, setIndex] = useState(0);

    if (photos.length === 0) return null;

    if (photos.length === 1) {
        /* eslint-disable-next-line @next/next/no-img-element */
        return <img src={photos[0].signed_url} alt="Memory" className="rounded-xl w-full max-h-80 object-cover border dark:border-border/50" />;
    }

    return (
        <div className="relative rounded-xl overflow-hidden group/carousel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={photos[index].signed_url}
                alt={`Memory ${index + 1}`}
                className="w-full max-h-80 object-cover"
            />
            <button
                onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                aria-label="Previous photo"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            <button
                onClick={() => setIndex((i) => (i + 1) % photos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                aria-label="Next photo"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setIndex(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/50"}`}
                        aria-label={`Go to photo ${i + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}
