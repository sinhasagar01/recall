-- difficulty, confidence and tags each carried a default and, for the first two,
-- a CHECK constraint — but no NOT NULL.
--
-- A CHECK constraint passes on NULL. `check (difficulty in ('easy','medium','hard'))`
-- evaluates to NULL, not false, for a null value, and a row is rejected only on
-- false. So an explicit `insert ... (difficulty) values (null)` succeeded, and every
-- consumer inherited a null case that should never have existed. A column default
-- only ever covers an OMITTED value; it does nothing about an explicit null.
--
-- This is a forward migration. The original is left exactly as it was applied.

-- Backfill first: adding NOT NULL to a column holding nulls would fail.
update public.topics set difficulty = 'medium' where difficulty is null;
update public.topics set confidence = 'new'    where confidence is null;
update public.topics set tags       = '{}'     where tags is null;

alter table public.topics
  alter column difficulty set not null,
  alter column confidence set not null,
  alter column tags       set not null;
