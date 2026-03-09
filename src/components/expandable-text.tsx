"use client";

import { useState } from "react";

interface ExpandableTextProps {
    text: string;
    maxLength?: number;
}

export function ExpandableText({ text, maxLength = 180 }: ExpandableTextProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!text) return null;

    const isLongText = text.length > maxLength;

    return (
        <div className="relative">
            <div className={`prose prose-sm dark:prose-invert text-muted-foreground ${!isExpanded && isLongText ? 'line-clamp-3' : ''}`}>
                {text}
            </div>
            {isLongText && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors focus:outline-none"
                >
                    {isExpanded ? "Show less" : "Read more"}
                </button>
            )}
        </div>
    );
}
