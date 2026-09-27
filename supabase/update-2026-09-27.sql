-- Opening balance (2026-09-27): account-level starting values.
-- Run this in the Supabase SQL editor (or as a migration). Safe to re-run.
--
-- The opening balance is the amount an account held when tracking began.
-- It is NOT a transaction — never classified as income/expense/transfer —
-- and is stored on the account, not fabricated into history. Balance
-- = opening_balance + Σ signed transaction amounts dated on/after
-- opening_balance_date (see lib/balances.ts, the single source of truth).
alter table public.accounts
  add column if not exists opening_balance numeric(14,2),
  add column if not exists opening_balance_date date;

-- Reimbursement transaction type (2026-09-27): money received for
-- something someone else paid for. It offsets the expense total in the
-- dashboard summary (see app/api/summary/route.ts) instead of inflating
-- income. Enum values can't be used in the same transaction that adds
-- them — this runs as its own statement, which the Supabase SQL editor
-- does when the file is executed as a whole.
alter type public.txn_type add value if not exists 'reimbursement';
