-- Recall's only table. One row is one thing you learned.
--
-- There is deliberately nothing else: no quiz_attempts, no practice_sessions,
-- no categories table, no analytics. Practice results live on the topic row
-- itself, because the product only ever asks "how well do I know this?".

create table public.topics (
  id                      uuid primary key default gen_random_uuid(),
  -- Clients never send user_id. It comes from this default, and the insert
  -- policy's with-check refuses anything else.
  user_id                 uuid not null default auth.uid()
                            references auth.users (id) on delete cascade,
  title                   text not null,
  definition              text not null,
  mental_model            text,
  mental_model_image_path text,
  category                text,
  tags                    text[] default '{}',
  difficulty              text default 'medium'
                            check (difficulty in ('easy', 'medium', 'hard')),
  confidence              text default 'new'
                            check (confidence in ('new', 'weak', 'okay', 'strong')),
  practice_count          integer not null default 0,
  last_practiced_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- BEFORE UPDATE only. An insert keeps whatever created_at/updated_at it was
-- given, which is what makes the trigger observable in a test.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger topics_set_updated_at
  before update on public.topics
  for each row
  execute function public.set_updated_at();

-- The library lists newest first, scoped to one user.
create index topics_user_id_created_at_idx
  on public.topics (user_id, created_at desc);

-- Weak topics, and the confidence filter on the library.
create index topics_user_id_confidence_idx
  on public.topics (user_id, confidence);

alter table public.topics enable row level security;

-- Four policies, one per command. `(select auth.uid())` rather than a bare
-- call so the planner evaluates it once per statement instead of per row.
create policy topics_select_own on public.topics
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy topics_insert_own on public.topics
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy topics_update_own on public.topics
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy topics_delete_own on public.topics
  for delete to authenticated
  using ((select auth.uid()) = user_id);
