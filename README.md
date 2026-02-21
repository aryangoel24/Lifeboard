# Food Tracker

A personal nutrition and habit tracking app built with Next.js and Supabase. AI-powered food logging, recipe management, pantry tracking, budget monitoring, and daily habit streaks — all in one place.

---

## Overview

Food Tracker is a full-stack personal health app designed around reducing friction. Food entries can be logged by describing a meal in plain text, uploading a photo, or scanning a nutrition label — all processed by OpenAI to estimate macros automatically. The app extends beyond the browser via a REST API consumed by iOS Shortcuts and Google Apps Script automations, so meals, habits, and expenses can be captured without ever opening the web app.

---

## Automations

Food Tracker exposes a token-authenticated REST API (`/api/v1/`) that external tools can call without touching the web app.

### Google Apps Script — Grocery Receipt Parsing
A Google Apps Script monitors a Gmail inbox for grocery receipt emails on a daily trigger. When a receipt arrives, it forwards the email body to `/api/v1/receipt`, which uses OpenAI to extract the total amount and logs it as an expense entry — automatically, with no manual input.

### iOS Shortcuts
Pre-built iOS Shortcuts use the REST API to enable one-tap actions from the iPhone home screen or lock screen:
- **Log a habit** — mark creatine, gym, or any custom habit as done
- **Analyze a food photo** — take a photo, get AI macro estimation, and log the entry
- **Scan a nutrition label** — photograph a label and auto-create a pantry item

All API requests authenticate via a SHA-256 hashed personal token generated in the Goals page.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | [Next.js 14](https://nextjs.org) (App Router, Server Actions, Server Components) |
| Language | TypeScript |
| Backend / Auth | [Supabase](https://supabase.com) (PostgreSQL, Auth, Storage) |
| AI | [OpenAI](https://platform.openai.com) — gpt-4o / gpt-4o-mini for food analysis, label scanning, receipt parsing, and learning content |
| UI Components | [shadcn/ui](https://ui.shadcn.com) (Radix UI primitives, New York style) |
| Styling | Tailwind CSS |
| Charts | [Recharts](https://recharts.org) |
| Toasts | [Sonner](https://sonner.emilkowal.ski) |
| Date Utilities | [date-fns](https://date-fns.org) |
| Icons | [Lucide React](https://lucide.dev) |
| Theming | [next-themes](https://github.com/pacocoursey/next-themes) (dark / light mode) |
| Deployment | [Vercel](https://vercel.com) |

---

## Architecture

- **Next.js App Router** with route groups for protected (`(app)`) and public (`(auth)`) pages
- **Server Components** for data fetching; Client Components only where interactivity is needed
- **Server Actions** (`src/lib/actions/`) handle all mutations — each action validates auth via `supabase.auth.getUser()` before touching the database
- **Parallel data fetching** with `Promise.all()` per page to minimise server round-trips
- **Token-authenticated REST API** (`/api/v1/`) for external integrations — tokens are SHA-256 hashed and stored in the database, never in plaintext
- **Timezone-aware date handling** throughout — user timezone stored in profile and applied to all date operations
- **Streak engine** tracks current and longest streaks for logging, goals, cooking, and each individual habit

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used in API routes to bypass RLS |
| `OPENAI_API_KEY` | OpenAI API key for all AI-powered features |

## Pages

### Dashboard
The daily hub. Shows all food entries for the selected date alongside a live macro summary (calories, protein, carbs, fat vs. daily goals). Includes a weight log, habit tracking cards (built-in and custom), quick-log meal templates, and streak counters. Navigate to any past or future date.

### Calendar
A monthly calendar view where each day is colour-coded by calorie goal completion. Click any day to see a full nutrition summary for that date.

### Analytics
Trend charts and aggregated stats over configurable time windows. Covers calorie and macro trends, meal category breakdowns, weight history with TDEE estimation, and per-habit completion rates.

### Recipes
A personal recipe library. Create recipes by adding ingredients (linked to pantry items or entered manually), set serving counts, and let the app calculate total and per-serving macros. Log any recipe directly as a food entry with a configurable number of servings.

### Pantry
An ingredient library grouped by category (protein, dairy, grain, vegetable, fruit, fat/oil, spice, beverage, other). Each item stores nutrition per base unit and optional cost, forming the source of truth for recipe ingredient macros.

### Goals
Configure daily nutrition targets (calories, protein, carbs, fat), goal weight, timezone, and built-in habit goals (creatine servings/day, gym days/week). Manage custom habits — set tracking type (checkbox, counter, or duration), frequency, and target values. Generate and manage your personal API token for external integrations.

### Budget
Track food-related spending. Set weekly and monthly budget goals, log expenses manually or via automated receipt parsing, and see a breakdown of cooking vs. eating-out costs.

### Achievements
An achievement and streak system. Unlock badges for logging consistency, hitting macro goals, cooking streaks, and habit completion. Tracks current and longest streaks per habit and activity type.

### Learn
A personal learning hub. Fetches a daily AI-generated news briefing on user-selected topics, provides an actionable summary and tip, and includes a flashcard system with spaced repetition (SM-2 algorithm) for retaining what you read.
