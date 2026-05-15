# CRM Pro

An AI-powered B2B CRM built with Next.js 14, Prisma (SQLite), NextAuth, and Claude. Pipeline drag-and-drop, contact/deal management, activity tracking, AI deal scoring + action suggestions + email drafting, analytics dashboard, and optional Gmail/Outlook sync.

## Tech stack

- Next.js 14 (App Router, Server Components)
- TypeScript (strict), Tailwind CSS, shadcn/ui (Radix primitives + CVA)
- Prisma ORM + SQLite (file-based, zero infra)
- NextAuth (credentials provider, JWT sessions, bcrypt hashed passwords)
- TanStack React Query for client data
- Zustand for UI state (sidebar, command palette, filters)
- @dnd-kit for the Kanban pipeline drag-and-drop
- Recharts for analytics charts
- Sonner for toast notifications
- Anthropic SDK (Claude Sonnet) for AI insights
- Zod for validation on both client and server

## Quick start

```bash
cp .env.example .env
# Edit DATABASE_URL, NEXTAUTH_SECRET, and ANTHROPIC_API_KEY (optional)
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

App runs at http://localhost:3000.

### Demo credentials

| Role    | Email             | Password     |
| ------- | ----------------- | ------------ |
| Admin   | admin@crm.com     | Admin1234!   |
| Manager | sarah@crm.com     | Sarah1234!   |
| Rep     | mike@crm.com      | Mike1234!    |

## Features

- Pipeline board (Kanban) with drag-and-drop stage transitions, optimistic updates, and automatic activity logging
- Contact CRUD with search, pagination, tags, source tracking, LinkedIn/website links
- Deal CRUD with stage, value, currency, probability, expected close date, tags
- Activity feed (CALL/EMAIL/MEETING/NOTE/TASK) per deal/contact with type filters
- AI Assistant per deal: health score, suggested next actions, AI-drafted emails (Claude Sonnet)
- Analytics dashboard: forecast, pipeline value, won this month, win rate, avg deal size, won-by-month, stage breakdown, activity mix, owner leaderboard
- Global Cmd-K command palette: instant fuzzy search across contacts and deals
- Role-based access (ADMIN/MANAGER/REP), JWT-backed sessions
- Optional Gmail and Outlook OAuth email sync
- Dark theme by default

## Architecture

```
+----------------------------------------------------------+
|                Next.js App Router (Node)                 |
|  +--------------+    +------------------+   +---------+  |
|  | Server pages | -> | API route        |-> | Prisma  |  |
|  | (RSC)        |    | handlers         |   | client  |  |
|  +--------------+    +------------------+   +----+----+  |
|         |                    ^                   |       |
|         v                    |                   v       |
|  +--------------+    +------------------+   +---------+  |
|  | Client comps |--->| React Query +    |   | SQLite  |  |
|  | + Zustand    |    | fetch /api/*     |   | crm.db  |  |
|  +--------------+    +------------------+   +---------+  |
|                              |                           |
|                              v                           |
|                      +----------------+                  |
|                      | Anthropic API  |                  |
|                      | (Claude)       |                  |
|                      +----------------+                  |
+----------------------------------------------------------+
```

- Server components read directly from Prisma (no extra hop).
- Client components mutate via /api/* route handlers (RBAC + Zod-validated).
- NextAuth middleware protects all non-login routes.
- Money/dates/tags are normalized via lib/utils.ts helpers.

## Project structure

```
app/
  (auth)/login/         credentials login page
  (dashboard)/          authed shell (sidebar, topbar, command palette)
    dashboard/          home (greeting, KPIs, recent activity, at-risk)
    contacts/           list + detail
    deals/              list + detail (with AI panel)
    pipeline/           Kanban board
    analytics/          charts dashboard
    settings/           profile, users, stages, email sync
  api/                  route handlers (contacts, deals, activities, stages,
                        users, search, analytics, ai/*, email-sync/*)
  layout.tsx            root (Inter font, dark, providers)
  providers.tsx         QueryClient, SessionProvider, TooltipProvider, Toaster
components/
  ui/                   shadcn primitives (button, dialog, table, ...)
  layout/               Sidebar, TopBar, CommandPalette
  crm/                  PipelineBoard, DealCard, DealForm, ContactCard, ContactForm,
                        ActivityFeed, ActivityForm, AIAssistantPanel, EmailComposer,
                        WinProbabilityBadge, AnalyticsDashboard
lib/                    prisma, auth, utils, ai (Claude), analytics, gmail, outlook
prisma/                 schema.prisma, seed.ts
store/                  zustand store
types/                  shared TS types + next-auth augmentation
middleware.ts           NextAuth route guard
```

## SQLite notes

- The DB lives at `prisma/crm.db` (configurable via `DATABASE_URL`).
- To back up: copy the `.db` file.
- SQLite does not support Postgres `enum` types, so the schema models enum-like fields (`User.role`, `Activity.type`, `Deal.stage`) as `String` with validation in the API layer.
- Reset locally with `npm run db:reset` (DESTRUCTIVE — wipes data and re-seeds).

## AI integration

- `lib/ai.ts` wraps the Anthropic SDK and calls Claude Sonnet for three flows:
  - `scoreDeal` -> 0-100 health score with reasoning, risks, opportunities
  - `suggestActions` -> 3 next best actions with priorities
  - `draftEmail` -> subject/body for a follow-up/proposal/closing/intro email
- All three return JSON-only completions and fall back to a safe deterministic baseline when `ANTHROPIC_API_KEY` is missing or the API errors.
- AI outputs are persisted as `AIInsight` rows for auditability.

## Email sync (optional)

- `/api/email-sync/gmail` and `/api/email-sync/outlook` kick off OAuth flows.
- Set `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` and/or `OUTLOOK_CLIENT_ID`/`OUTLOOK_CLIENT_SECRET` in `.env`.
- Redirect URIs: `http://localhost:3000/api/email-sync/gmail/callback` and `.../outlook/callback`.
- Synced messages auto-link to contacts by matching `from`/`to` email addresses.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — start prod server
- `npm run db:generate` — regenerate Prisma client
- `npm run db:migrate` — create + apply a dev migration
- `npm run db:seed` — seed demo data
- `npm run db:studio` — open Prisma Studio
- `npm run db:reset` — reset DB and re-seed

## License

MIT
