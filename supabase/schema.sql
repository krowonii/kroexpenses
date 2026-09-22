-- Expenses tracker — initial schema
-- Run this in the Supabase SQL editor (or as a migration).
--
-- Modeled on the transaction model in docs/expenses-masterdoc.pdf:
-- accounts establish provenance, transactions are the standardized
-- record, categories are user-custom (AI works against this set),
-- budgets are optional monthly limits.

create type account_type as enum ('bank', 'ewallet', 'cash', 'credit_card', 'other');
create type txn_type as enum ('expense', 'income', 'transfer', 'external_transfer');
create type txn_status as enum ('categorized', 'pending_review', 'unmatched');
create type txn_direction as enum ('in', 'out');

-- Accounts: provenance only, no balance tracking.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type account_type not null default 'bank',
  institution text,
  is_active boolean not null default true,
  -- Per-account import configuration (e.g. CSV column mapping).
  import_config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- User-custom taxonomy. AI categorization works against this set,
-- never a fixed provider taxonomy.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- The trusted transaction dataset. Amount is signed:
-- negative = outflow, positive = inflow.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  txn_date date not null,
  amount numeric(14,2) not null,
  direction txn_direction not null,
  merchant text,
  description text,
  txn_type txn_type not null default 'expense',
  category_id uuid references public.categories(id) on delete set null,
  -- 'manual' | 'import:<statement-id>'
  source text not null default 'manual',
  status txn_status not null default 'categorized',
  -- 0–1, from AI categorization; null when not AI-categorized
  confidence numeric(4,3),
  -- Counterpart transaction for reconciled internal transfers
  related_transaction_id uuid references public.transactions(id) on delete set null,
  -- Deterministic duplicate-detection hash (account + date + amount + normalized description)
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint direction_matches_amount check (
    (direction = 'in' and amount >= 0) or (direction = 'out' and amount <= 0)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_category_idx on public.transactions (user_id, category_id);
create index transactions_dedupe_idx on public.transactions (user_id, dedupe_key) where dedupe_key is not null;

-- Optional budgets: category + monthly limit. No budget = no behavior.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_limit numeric(14,2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

-- Correction/learning rules: user corrections retained so future
-- categorization improves (matched against merchant/description).
create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Row level security: users see and manage only their own data.
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.categorization_rules enable row level security;

create policy "users manage own accounts"
  on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own categories"
  on public.categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own transactions"
  on public.transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own budgets"
  on public.budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own categorization rules"
  on public.categorization_rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Statement imports: one record per processed batch, powering the
-- import-history section of the import screen.
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  transfer_count integer not null default 0,
  review_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists imports_user_created_idx
  on public.imports (user_id, created_at desc);

alter table public.imports enable row level security;

create policy "users manage own imports"
  on public.imports for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.transactions
  add column if not exists import_id uuid references public.imports(id) on delete set null;

-- Auto-seed starter accounts + categories the moment a user is created
-- (trigger on auth.users), so the first sign-in already has the accounts
-- the import pipeline needs. Also available standalone as
-- supabase/seed-trigger.sql. Safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.accounts (user_id, name, type, institution) values
    (new.id, 'BDO Savings', 'bank', 'BDO'),
    (new.id, 'GCash', 'ewallet', 'GCash'),
    (new.id, 'Cash', 'cash', null),
    (new.id, 'Credit Card', 'credit_card', null),
    (new.id, 'Other Bank', 'other', null);

  insert into public.categories (user_id, name, sort_order) values
    (new.id, 'Food', 1),
    (new.id, 'Shopping', 2),
    (new.id, 'Bills', 3),
    (new.id, 'Transportation', 4),
    (new.id, 'Entertainment', 5),
    (new.id, 'Other', 6);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
