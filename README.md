# Expenses

Personal expenses tracker: statement imports (BDO / GCash / Credit Card),
transfer reconciliation, AI categorization with confidence-based review, and
a financial dashboard.

- **Source of truth**: `docs/expenses-masterdoc.pdf` — read it before changing scope.
- **Design reference**: `docs/initial-ui.html` — every screen must stay on its
  design tokens, which live in `app/globals.css` (`@theme` block).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase
(Postgres / Auth / Storage) · Zod · SheetJS xlsx (CSV + XLSX parsing) ·
Google GenAI SDK (categorization) · Recharts · Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Apply the database schema in the Supabase SQL editor: `supabase/schema.sql`,
then `supabase/seed-trigger.sql` (a trigger auto-seeds starter accounts +
categories the moment a user signs up — no manual setup). Auth is wired up:
sign in once at `/login` and the session persists — `proxy.ts` refreshes it
and protects the routes, so the app recognizes you on every boot. The import
screen runs fully (real parsing/processing counts) in preview-only mode
until the database is connected; the dashboard and review queue run on
real data — empty states until transactions are in.

## Structure

```
app/                  # routes: dashboard (/), login, import, review, accounts, transactions
app/api/import/       # detect (inspect uploads), process (run pipeline), history
app/api/accounts/     # active accounts for the import screen
app/api/summary/      # dashboard aggregates (totals, categories, series)
app/api/review/       # review queue (GET items) + decisions (POST)
app/api/transactions/ # manual expense entry (POST) + ledger listing (GET: filters + pagination) + clear data (DELETE)
app/api/categories/   # category list + add/rename/delete + drag-reorder (POST)
components/
  ui.tsx              # shared primitives: Panel, PanelHead, Card, PageShell, Skeleton, chips
  settings/           # settings cog + modal (sign out, clear transaction data)
  dashboard/          # dashboard sections (header, summary, charts, table, …)
  import/             # upload area, file review, processing state, summary, history
  review/             # review board (confirm/correct + unmatched transfers)
  transactions/       # full ledger: search + filters + pagination
  expense/            # floating add: sheet, amount numpad (mobile), category editor
lib/
  types.ts            # domain model: Transaction, Account, Category, statuses
  defaults.ts         # starter accounts + categories (used until the DB is ready)
  import/             # the import pipeline, UI-independent:
                      #   parse (SheetJS), detect (source/account), normalize,
                      #   dedupe (sha256 keys), reconcile (transfers + fees),
                      #   categorize (rules → LLM), pipeline, db-context
  format.ts           # peso formatting
  dashboard.ts        # dashboard view model + period ranges
  supabase/           # browser + server clients (cookie-session auth)
proxy.ts              # session refresh + route protection (Next 16 proxy)
supabase/schema.sql   # database schema + RLS
supabase/seed-trigger.sql  # auto-seeds accounts + categories on sign-up
```

## Not in MVP

Bank API integrations, balance sync, net worth, investments, forecasting,
receipt OCR, multi-user, mobile app, complex budgeting.
