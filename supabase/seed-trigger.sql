-- Auto-seed starter accounts + categories the moment a user is created,
-- so the first sign-in already has the accounts the import pipeline needs
-- (BDO Savings, GCash, Cash, Credit Card, Other Bank) and the categories
-- the rules work against.
--
-- Run this in the Supabase SQL editor after schema.sql. Safe to re-run:
-- the function is replaced, the trigger is dropped and recreated, and the
-- backfill only touches users with no accounts/categories yet.
--
-- The function is security definer so it can insert despite RLS — it runs
-- as the table owner, never as the (not yet existing) new user.

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

-- Backfill: seed any user that already exists but has no accounts or no
-- categories yet (e.g. signed up before this trigger existed). Idempotent —
-- users that already have them are left alone.
insert into public.accounts (user_id, name, type, institution)
select u.id, v.name, v.type::account_type, v.institution
from auth.users u
cross join (values
  ('BDO Savings', 'bank', 'BDO'),
  ('GCash', 'ewallet', 'GCash'),
  ('Cash', 'cash', null),
  ('Credit Card', 'credit_card', null),
  ('Other Bank', 'other', null)
) as v(name, type, institution)
where not exists (select 1 from public.accounts a where a.user_id = u.id);

insert into public.categories (user_id, name, sort_order)
select u.id, v.name, v.sort_order
from auth.users u
cross join (values
  ('Food', 1), ('Shopping', 2), ('Bills', 3),
  ('Transportation', 4), ('Entertainment', 5), ('Other', 6)
) as v(name, sort_order)
where not exists (select 1 from public.categories c where c.user_id = u.id);
