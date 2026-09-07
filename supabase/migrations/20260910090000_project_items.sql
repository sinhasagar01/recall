-- The project ledger.
--
-- A record of what the capstone produced: decisions, PRs, diagrams, incidents,
-- milestones. LINKS, not documents — the thing lives where you made it, and the
-- ledger knows its title, its kind, its status, and which capability it serves.
--
-- ── Why a fourth table, when three arcs have each added one ─────────────────
-- The test that admitted `sources` and `capabilities` was "is this already a
-- topic?" A ledger item is not: never practised, no confidence, no difficulty.
--
-- But that test alone would also admit a column, so here is the sharper one. This
-- would belong on an existing table only if every item necessarily had exactly
-- one owner row there, and it does not:
--
--   * Not on `topics`. An item is not a retrieval unit, and
--     topics_shape_is_consistent would need a third arm describing a row that is
--     mostly absence — the arc 2 argument, unchanged.
--   * Not on `capabilities`. `capability_id` is NULLABLE: an incident or a
--     milestone often serves no capability at all. A column on `capabilities`
--     cannot hold a row belonging to no capability.
--   * Not a text[] on `capabilities`. Array elements have no identity, so status
--     could not be edited per item and the capability filter could not link to
--     one — the arc 3 argument, unchanged.
--
-- Four tables in four arcs, and the rule has held each time: do not invent an
-- entity for something that already is one. Each of the four is a different thing
-- with a different lifetime.

create table public.project_items (
  id             uuid primary key default gen_random_uuid(),
  -- Never client-supplied. The default provides it and the insert policy's
  -- with-check refuses anything else.
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /*
    Six kinds. A CHECK rather than a Postgres enum type: adding a kind to an enum
    needs ALTER TYPE, which cannot run inside the same transaction as a migration
    that then uses the new value. A CHECK is edited like any other constraint.
  */
  kind           text not null,
  title          text not null,

  /*
    Optional, because a decision you have made but not written up yet is still a
    decision. The row says "no link yet" rather than looking broken.

    Not validated as a URL here — src/lib/domain/source-form.ts does that in the
    domain, http(s) only, so a `javascript:` string cannot be stored and later
    rendered as a link. A CHECK cannot parse a URL, and a regex that tried would
    be a worse liar than no check at all.
  */
  link           text,

  /* One line, for future you. Not a document — see the constraint list below. */
  note           text,

  /*
    ── One stored enum, six vocabularies ───────────────────────────────────────
    open | settled | retired, rendered in each kind's own words: an ADR is
    Decided, a task is Done, an incident is Closed. That mapping lives in
    src/lib/domain/ledger.ts, beside the which-half copy and the delete copy,
    because it is a rule stated in words and the words must not drift from it.

    Three is enough for every kind. Six would be a workflow.
  */
  status         text not null default 'open',

  /*
    Nullable, and that nullability is why this is its own table: most incidents
    and milestones serve no capability. ON DELETE SET NULL, the same shape as
    source_id and topics.capability_id — deleting a capability keeps the ledger
    entry and drops the line saying what it served.

    Note the chain this completes: deleting a PHASE cascades to its capabilities,
    and each of those nulls its ledger items and its topics. Asserted end to end
    in supabase/tests/ledger_test.sql.
  */
  capability_id  uuid references public.capabilities(id) on delete set null,

  /*
    ── Stamped, never back-dated ───────────────────────────────────────────────
    There is deliberately NO date column. The item is stamped when you add it.
    Back-dating a decision you made last week is the kind of tidying that turns a
    record into a story, and a nullable `occurred_at` is an invitation to do it.
  */
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint project_items_kind_is_known check (
    kind in ('adr', 'task', 'diagram', 'incident', 'milestone', 'scale_exercise')
  ),
  constraint project_items_status_is_known check (
    status in ('open', 'settled', 'retired')
  ),
  constraint project_items_title_is_not_blank check (length(btrim(title)) > 0),
  constraint project_items_link_is_not_blank check (link is null or length(btrim(link)) > 0),
  constraint project_items_note_is_not_blank check (note is null or length(btrim(note)) > 0)
);

/* Newest first is the list's only order, so the index matches it. */
create index project_items_user_created_idx
  on public.project_items (user_id, created_at desc);

create index project_items_capability_idx
  on public.project_items (capability_id) where capability_id is not null;

/*
  ── No documents, ever ──────────────────────────────────────────────────────
  Deliberately absent: no `body`, no `context`, no `alternatives`, no
  `consequences`, no `image_path`. Those live at the link, in a file you can diff,
  which is what an ADR is for. supabase/tests/ledger_test.sql asserts the exact
  column set, so any of them fails a test that says why it must not exist.

  Also absent: any column the ledger could contribute to `demonstrated` with.
  Demonstrated stays recall plus evidence, exactly as arc 3 defined it — the
  product cannot know whether you shipped what a URL points at, and a rule
  satisfiable with a bookmark is not a rule.
*/

alter table public.project_items enable row level security;

-- Four policies, one per command. `(select auth.uid())` rather than a bare call
-- so the planner evaluates it once per statement instead of per row.
create policy project_items_select_own on public.project_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy project_items_insert_own on public.project_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy project_items_update_own on public.project_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy project_items_delete_own on public.project_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

/*
  ── The GRANT, in this migration rather than a later one ────────────────────
  Arc 2 shipped a production outage from exactly this omission. Arc 3 then proved
  the trap deliberately: removing the grants left all 59 pgTAP assertions green,
  because the local stack grants new tables in `public` through default ACLs
  whether or not a migration says so. A hosted project does not.

  src/lib/data/table-grants.test.ts reads the migrations rather than the database,
  which is the only guard that can catch this.
*/
grant select, insert, update, delete on table public.project_items to authenticated;
