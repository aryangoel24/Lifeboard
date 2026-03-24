export type Intent =
  | { type: "direct_fetch"; key: "today_food" | "profile" | "pantry" }
  | { type: "direct_action"; action: "log_food"; description: string }
  | { type: "complex" };

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => Intent]> = [
  [
    /macros?\s+today|today.?s?\s+macros?|what did i eat today|calories today/i,
    () => ({ type: "direct_fetch", key: "today_food" }),
  ],
  [
    /my\s+(calorie|protein|macro|diet|daily)\s+goals?|what.?s my goal/i,
    () => ({ type: "direct_fetch", key: "profile" }),
  ],
  [
    /pantry|what.?s in my\s+(pantry|fridge|kitchen)/i,
    () => ({ type: "direct_fetch", key: "pantry" }),
  ],
  [
    /^log\s+(.+)/i,
    (m) => ({ type: "direct_action", action: "log_food", description: m[1] }),
  ],
  [
    /^add\s+(.+)\s+to\s+(my\s+)?log/i,
    (m) => ({ type: "direct_action", action: "log_food", description: m[1] }),
  ],
];

export function classifyIntent(input: string): Intent {
  const trimmed = input.trim();
  for (const [re, handler] of PATTERNS) {
    const m = trimmed.match(re);
    if (m) return handler(m);
  }
  return { type: "complex" };
}
