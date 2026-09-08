-- Today. One row per date per user.
--
-- Three things you type each morning — one to explain, one to rebuild, one to
-- apply — plus a blocker. Free text, by hand. Nothing derived, nothing suggested,
-- nothing scheduled.
--
-- ── Why a fifth table ───────────────────────────────────────────────────────
-- A day is none of the four things that already exist. Not a practisable unit.
-- Not a capability — that is a claim about ability which outlives any date. Not a
-- ledger item — that is a link to an artefact, and these are words you typed.
-- And no existing table has one row per user per date, so there is no column to
-- add this to.
--
-- ── Why three scalar pairs rather than jsonb ────────────────────────────────
-- Arc 1 chose nine scalar columns over jsonb because `supabase gen types` renders
-- jsonb as `Json`, which every object satisfies, so TopicBoundaryIsSound would
-- have been vacuous for exactly the columns being added.
--
-- THAT ARGUMENT DOES NOT APPLY HERE, and it is worth saying so rather than
-- borrowing it: `days` has no domain union and no boundary type, so there is
-- nothing for jsonb to make vacuous. The reasons here are different:
--
--   * Three fixed slots is the shape of the feature. "Three lines is the shape of
--     a day whether or not you filled all three." A jsonb array can hold zero or
--     four; these columns make "exactly three" true of the schema, and
--     columns_are asserts it. A fourth intention needs a migration, which is the
--     correct amount of friction.
--   * Ticking one box is a single-column UPDATE. With jsonb it is
--     read-modify-write, which races a second tab — and this page is used from two
--     places by design: typed at a desk, ticked from a phone.
--   * The not-blank CHECKs are per column. Inside a document they become fragile
--     expression checks over a shape the database cannot see.

create table public.days (
  id                  uuid primary key default gen_random_uuid(),
  -- Never client-supplied. The default provides it and the insert policy's
  -- with-check refuses anything else.
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /*
    The user's LOCAL date, computed in the browser by localDateString and sent
    explicitly — never derived server-side. On a UTC server the calendar date is
    wrong for a third of every day, which is the whole reason that helper exists.

    A `date`, not a timestamptz: a day is a calendar day, and storing an instant
    would re-introduce the timezone question this column exists to answer once.
  */
  day                 date not null,

  /*
    Three slots, always three. An empty slot keeps its place and its label —
    collapsing to two would make a missing decision invisible.
  */
  explain_text        text,
  explain_done        boolean not null default false,
  rebuild_text        text,
  rebuild_done        boolean not null default false,
  apply_text          text,
  apply_done          boolean not null default false,

  /*
    The one thing on this page that outlives its day. It shows on Today until
    resolved, because a problem written on Friday and forgotten by Monday is the
    failure the field exists to prevent. Resolving keeps the text and stamps
    the date — it never deletes what you wrote.
  */
  blocker_text        text,
  blocker_resolved_at timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  /*
    One row per date per user. This is what makes "a day with nothing typed has no
    row" safe to rely on: a second insert for the same day fails loudly rather
    than quietly producing two competing records of one morning.
  */
  constraint days_one_row_per_day unique (user_id, day),

  constraint days_explain_is_not_blank
    check (explain_text is null or length(btrim(explain_text)) > 0),
  constraint days_rebuild_is_not_blank
    check (rebuild_text is null or length(btrim(rebuild_text)) > 0),
  constraint days_apply_is_not_blank
    check (apply_text is null or length(btrim(apply_text)) > 0),
  constraint days_blocker_is_not_blank
    check (blocker_text is null or length(btrim(blocker_text)) > 0),

  /*
    An empty line cannot be ticked. The UI renders its box as a span rather than a
    control, and this is the same rule said where it cannot be worked around —
    a done flag with no text is a claim about nothing.
  */
  constraint days_explain_done_needs_text
    check (explain_done = false or explain_text is not null),
  constraint days_rebuild_done_needs_text
    check (rebuild_done = false or rebuild_text is not null),
  constraint days_apply_done_needs_text
    check (apply_done = false or apply_text is not null),

  /*
    You cannot resolve a blocker you never wrote. Without this, resolving an empty
    blocker would leave a stamped date attached to nothing, and the open-blocker
    query would be reading rows that mean nothing.
  */
  constraint days_resolved_needs_a_blocker
    check (blocker_resolved_at is null or blocker_text is not null)
);

/*
  The open blocker, found without scanning.

  A partial index over exactly the rows the query wants: unresolved blockers,
  ordered by day. "Which problem have I been carrying longest" reads ONE row
  however many days exist — see readOpenBlocker in lib/data/today.ts.
*/
create index days_open_blocker_idx
  on public.days (user_id, day)
  where blocker_text is not null and blocker_resolved_at is null;

/* The log, newest first, and the recent window Today reads. */
create index days_user_day_idx on public.days (user_id, day desc);

/*
  ── Deliberately absent ─────────────────────────────────────────────────────
  No streak, no completion rate, no `carried_from`, no `carried_days`. Yesterday's
  unticked lines are PREFILLED, not carried: they arrive as editable text and are
  not written until you save, so there is no lineage to store and nothing here to
  count days with. supabase/tests/days_test.sql asserts the exact column set, so
  any of them fails a test that says why.

  No foreign keys either. An intention links to no source, capability, ledger item
  or topic — linking them would make Today derive its content, which is the
  decision this whole screen is built against.
*/

alter table public.days enable row level security;

-- Four policies, one per command. `(select auth.uid())` rather than a bare call so
-- the planner evaluates it once per statement instead of per row.
create policy days_select_own on public.days
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy days_insert_own on public.days
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy days_update_own on public.days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy days_delete_own on public.days
  for delete to authenticated
  using ((select auth.uid()) = user_id);

/*
  ── The GRANT, in this migration rather than a later one ────────────────────
  Arc 2 shipped a production outage from exactly this omission. Arc 3 proved the
  trap deliberately and arc 4 reproduced it: removing the grants leaves the whole
  pgTAP suite GREEN, because the local stack grants new tables in `public` through
  default ACLs whether or not a migration says so. A hosted project does not.

  src/lib/data/table-grants.test.ts reads the migrations rather than the database,
  which is the only guard that can catch this.
*/
grant select, insert, update, delete on table public.days to authenticated;
