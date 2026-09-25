-- Expenses tracker — schema update, 2026-09-25
-- Run each statement once in the Supabase SQL editor. Both are idempotent.

-- Time-of-day for same-day sorting: statement dates like "2026-07-26 03:20 AM"
-- (GCash stamps every row) keep their time so same-day rows sort chronologically.
-- Text "HH:MM" 24h — lexicographic order is chronological. Existing rows stay
-- null (their time was never stored) and sort after timed rows within a day.
alter table public.transactions add column if not exists txn_time text;

-- New review decision: excluded rows leave all totals (income, expense,
-- categories, daily series) until restored.
alter type txn_status add value if not exists 'excluded' after 'unmatched';
