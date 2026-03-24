# Lifeboard

A personal life-management platform built with Next.js 14, Supabase, and AI. Covers nutrition logging, habits, weight tracking, budget, pantry, recipes, a knowledge graph, episodic journal, AI chat, Telegram bot, daily digest, and flashcards.

---

## Automations

Lifeboard exposes a token-authenticated REST API (`/api/v1/`) that external tools can call without opening the web app.

### Google Apps Script — Grocery Receipt Parsing
A Google Apps Script monitors Gmail for grocery receipt emails on a daily trigger. It forwards the email body to `/api/v1/receipt`, which uses OpenAI to extract the total and logs it as an expense — no manual input required.

### iOS Shortcuts
Pre-built iOS Shortcuts use the REST API for one-tap actions from the home screen or lock screen:
- **Log a habit** — mark creatine, gym, or any custom habit as done
- **Analyze a food photo** — take a photo, get AI macro estimation, log the entry
- **Scan a nutrition label** — photograph a label and auto-create a pantry item

All API requests authenticate via a SHA-256 hashed personal token generated in the Goals page.

### Telegram Bot
Send messages to the bot to log food, expenses, pantry items, knowledge extractions, or personal events — all routed by an AI intent classifier.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 14 (App Router, Server Actions, Server Components) |
| Language | TypeScript |
| Backend / Auth | Supabase (PostgreSQL, Auth, Storage, Row-Level Security) |
| AI — Nutrition | OpenAI GPT-4o / GPT-4o-mini (food analysis, label scanning, receipt parsing, embeddings) |
| AI — Chat | Anthropic Claude via Vercel AI SDK (conversational assistant with tool use) |
| UI Components | shadcn/ui — Radix UI primitives, New York style, neutral base |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Knowledge Graph | @xyflow/react (React Flow) |
| Notifications | Sonner |
| Animations | Framer Motion |
| Date Utilities | date-fns |
| Icons | Lucide React |
| Theming | next-themes (dark / light mode) |

---

## Setup

```bash
npm install
```

Create `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — used in API routes to bypass RLS |
| `OPENAI_API_KEY` | GPT-4o for nutrition AI, embeddings, label/receipt parsing |
| `ANTHROPIC_API_KEY` | Claude for the AI chat assistant |
| `TELEGRAM_BOT_TOKEN` | Optional — enables the Telegram integration |

```bash
npm run dev    # http://localhost:3000
npm run build  # type-check + lint + production build
npm run lint   # ESLint
```

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/              # Public routes — /login, /signup
│   ├── (app)/               # Protected routes (require auth, render Header)
│   │   ├── dashboard/       # Daily food, habits, weight, steps
│   │   ├── analytics/       # Charts, trends, TDEE, habit stats
│   │   ├── calendar/        # Month-view calendar
│   │   ├── goals/           # Macro goals, habit settings, API token
│   │   ├── recipes/         # Recipe builder with pantry integration
│   │   ├── pantry/          # Ingredient inventory
│   │   ├── budget/          # Expense tracking & receipt scanning
│   │   ├── achievements/    # Unlockable achievement badges
│   │   ├── journal/         # Episodic memory (events, stories)
│   │   ├── learn/           # Knowledge graph, digest, extraction
│   │   │   ├── hub/         # Knowledge graph canvas
│   │   │   ├── digest/      # Article digest → graph updates
│   │   │   └── extract/     # URL/text → knowledge extraction
│   │   └── chat/            # AI assistant (Claude, with tools)
│   ├── api/
│   │   ├── v1/              # External REST API (Bearer token auth)
│   │   │   ├── food/        # Log food entries + AI analysis
│   │   │   ├── pantry/      # Read/scan pantry items
│   │   │   ├── habits/      # Log habits
│   │   │   └── receipt/     # Parse receipt photos
│   │   └── chat/            # Streaming AI chat route
│   └── auth/callback/       # Supabase OAuth code exchange
├── components/
│   ├── ui/                  # shadcn/ui primitives
│   ├── chat/                # Chat UI (message bubbles, interface)
│   └── *.tsx                # Feature components — flat, co-located
├── lib/
│   ├── actions/             # Server actions ("use server") — one file per domain
│   │   ├── dashboard.ts     # Consolidated dashboard data fetch (single getUser)
│   │   ├── analytics.ts     # Consolidated analytics data fetch
│   │   ├── food-entries.ts  # Food entry CRUD
│   │   ├── habits.ts        # Built-in habit logging + streak updates
│   │   ├── custom-habits.ts # Custom habit CRUD + logging
│   │   ├── weight.ts        # Weight entry CRUD
│   │   ├── goals.ts         # Profile / macro goals
│   │   ├── achievements.ts  # Streak tracking + achievement unlocks
│   │   └── ...              # recipes, pantry, budget, events, knowledge, etc.
│   ├── supabase/
│   │   ├── client.ts        # Browser client (photo uploads)
│   │   ├── server.ts        # Server client (cookie-based session)
│   │   ├── admin.ts         # Service-role client (API routes, storage)
│   │   └── middleware.ts    # Session refresh middleware
│   ├── services/            # Stateful service logic (chat context, deduplication)
│   ├── server/              # Server-only utilities (audio transcription)
│   ├── ai-utils.ts          # OpenAI: nutrition, embeddings, RAG, intent routing
│   ├── weight-utils.ts      # Pure weight / TDEE computation
│   ├── habit-utils.ts       # Pure habit computation + form parsing
│   ├── habit-debt-utils.ts  # Habit accountability / debt logic
│   ├── timezone.ts          # getToday() / getNow() using user's timezone cookie
│   ├── api-auth.ts          # Bearer token auth for external API
│   ├── api-response.ts      # apiSuccess() / apiError() response helpers
│   └── utils.ts             # cn(), formatDate(), getDayRange(), calcIngredientTotals()
├── types/
│   └── database.ts          # All DB types — single source of truth
└── hooks/                   # Client-side React hooks
```

---

## Architecture

### Server Actions Pattern
All mutations go through `src/lib/actions/`. Every action:
1. Has `"use server"` directive
2. Calls `supabase.auth.getUser()` to validate auth
3. Filters all queries by `user_id` (defense-in-depth alongside RLS)
4. Returns `{ error: string }` on failure, or calls `revalidatePath()` + returns `{}` on success

### Consolidated Data Fetching
Pages make **one** consolidated action call that runs all DB queries in parallel with `Promise.all()`. This minimizes `auth.getUser()` round-trips per page load:
- `getDashboardData(date)` — `src/lib/actions/dashboard.ts`
- `getAnalyticsData(today)` — `src/lib/actions/analytics.ts`

### Pure Functions vs Server Actions
`"use server"` files can only export `async` functions. Computation logic (no DB, no auth) lives in plain `src/lib/*.ts` files — `weight-utils.ts`, `habit-utils.ts`, `habit-debt-utils.ts`.

### Timezone Handling
User timezone is stored in `profiles.timezone`, persisted as a cookie on save, and read server-side via `src/lib/timezone.ts`. Always use `getToday()` / `getNow()` — never `new Date()` directly in server code.

### External REST API
`/api/v1/` routes authenticate via SHA-256 hashed Bearer tokens stored in `profiles.api_token_hash`. Logic: `src/lib/api-auth.ts`. Responses: `src/lib/api-response.ts`.

### Two AI Integrations
- **OpenAI** (`lib/ai-utils.ts`): nutrition estimation, label reading, receipt parsing, embeddings for RAG, habit icon generation, Telegram intent routing
- **Anthropic Claude** (Vercel AI SDK, `api/chat/route.ts`): conversational assistant with tool use (food logging, habit tracking, knowledge search)

### Habit Accountability (No-Refund System)
Opted-in habits accumulate "debt" in cents for missed days. `computeAndUpdateDebt()` runs idempotently on each dashboard load. State lives in `habit_debt` and `habit_debt_meta` tables; logic in `lib/habit-debt-utils.ts`.

---

## Pages

### Dashboard
Daily hub. Food entries for the selected date, live macro summary vs. goals, weight log, step count, habit tracking (built-in + custom), quick-log templates, and streak counters. Navigate to any date.

### Calendar
Monthly calendar where each day is colour-coded by calorie goal completion. Click a day to see that day's full nutrition summary.

### Analytics
Trend charts and aggregated stats over configurable time windows: calorie/macro trends, meal category breakdowns, weight history with TDEE estimation, and per-habit completion rates. Includes a CSV export.

### Recipes
Personal recipe library. Build recipes from pantry items or manual entries, set serving counts, and auto-calculate per-serving macros. Log any recipe as a food entry with a custom serving count.

### Pantry
Ingredient library grouped by category. Stores nutrition per base unit and optional cost — the source of truth for recipe macros and pantry scanning.

### Goals
Configure daily nutrition targets, goal weight, timezone, and built-in habit goals. Manage custom habits (tracking type, frequency, targets). Generate and manage your personal API token.

### Budget
Track food spending. Set weekly/monthly goals, log expenses manually or via automated receipt parsing, and see cooking vs. eating-out cost breakdowns.

### Achievements
Unlock badges for logging consistency, hitting macro goals, cooking streaks, and habit completion. Tracks current and longest streaks per habit type.

### Journal
Log personal events, stories, and memories. AI extracts a title, timestamp, people, places, and durable facts to optionally connect to the knowledge graph.

### Learn
A personal knowledge hub:
- **Hub** — interactive knowledge graph canvas with AI-generated subtopics
- **Digest** — paste an article URL or text; AI extracts insights and proposes updates to your graph
- **Extract** — structured extraction of concepts from any content into the graph
- Flashcard system with SM-2 spaced repetition for knowledge retention
