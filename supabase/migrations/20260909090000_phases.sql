-- Phases and capabilities.
--
-- A phase is a stretch of weeks and the handful of things you will be able to do
-- at the end of it. A capability is one of those things, written as an ability.
-- Topics link to a capability, and a capability is demonstrated by evidence.
--
-- ── Why two tables, and why a capability is not a column on phases ──────────
-- Arc 2's rule was "do not invent an entity for something that is already a
-- topic". A phase and a capability are not topics: never practised, no
-- confidence, never graded. That admits them, the way it admitted sources.
--
-- The sharper question is whether capabilities could be a `text[]` on phases.
-- They cannot:
--
--   * `topics.capability_id` needs a stable FK target. An array element has no
--     identity, so the central link of the whole arc — a topic pointing at one
--     capability — is unexpressible.
--   * `on delete set null` needs a real referent. Editing a capability's wording
--     would silently rewrite the array entry every topic depends on.
--   * Each capability carries its own derived state and its own row in the UI.
--
-- Two tables because there are two entities with two lifetimes: deleting a phase
-- destroys its capabilities, and a capability outlives nothing.
--
-- ── No dates anywhere in here ───────────────────────────────────────────────
-- `when_text` is free text on purpose. A date column would let the product work
-- out that you are behind, and it is not going to do that. There is no date
-- arithmetic in this arc, and no column here invites any.

create table public.phases (
  id          uuid primary key default gen_random_uuid(),
  -- Never client-supplied. Same arrangement as topics and sources: the default
  -- provides it and the insert policy's with-check refuses anything else.
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,

  name        text not null,

  /*
    "Weeks 1-2". Free text, never a date, never parsed. The reference is explicit
    that a date would let the product tell you that you are behind — this column
    is the shape of that refusal, so it is text and stays text.
  */
  when_text   text,

  /* "JavaScript: The Hard Parts - Full Stack Fundamentals". Free text, not a
     course list: ticking a course is the thing this whole screen exists to
     refuse. */
  sources_text text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint phases_name_is_not_blank check (length(btrim(name)) > 0),
  constraint phases_when_is_not_blank check (when_text is null or length(btrim(when_text)) > 0),
  constraint phases_sources_is_not_blank
    check (sources_text is null or length(btrim(sources_text)) > 0)
);

create index phases_user_created_idx on public.phases (user_id, created_at);

create table public.capabilities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,

  /*
    ON DELETE CASCADE: deleting a phase deletes its capabilities. A capability
    means nothing without the phase that set it, which is the opposite of a topic
    — hence the two different cascade shapes in this one migration.
  */
  phase_id    uuid not null references public.phases(id) on delete cascade,

  /* Written as an ability: "Explain the event loop without notes", not "Event
     loop". The form says so; nothing here can enforce prose. */
  name        text not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint capabilities_name_is_not_blank check (length(btrim(name)) > 0)
);

create index capabilities_phase_idx on public.capabilities (phase_id);
create index capabilities_user_created_idx on public.capabilities (user_id, created_at);

/*
  ── No stored "demonstrated" anywhere ───────────────────────────────────────
  Deliberately absent from both tables. Demonstrated is DERIVED: something linked
  is at okay or better on recall, AND something linked carries rebuild, challenge
  or production evidence. There is no boolean here for a manual tick to write to,
  and the checkbox in the UI has no click handler to write one with.

  supabase/tests/phases_test.sql asserts the exact column set of both tables, so
  a boolean cannot be added later without failing a test that says why.
*/

alter table public.phases enable row level security;
alter table public.capabilities enable row level security;

-- Four policies per table, one per command. `(select auth.uid())` rather than a
-- bare call so the planner evaluates it once per statement instead of per row.
create policy phases_select_own on public.phases
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy phases_insert_own on public.phases
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy phases_update_own on public.phases
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy phases_delete_own on public.phases
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy capabilities_select_own on public.capabilities
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy capabilities_insert_own on public.capabilities
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy capabilities_update_own on public.capabilities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy capabilities_delete_own on public.capabilities
  for delete to authenticated
  using ((select auth.uid()) = user_id);

/*
  ── The link ────────────────────────────────────────────────────────────────
  A column rather than a join table, the same shape as source_id: a topic serves
  at most one capability. If a topic genuinely serves two, the capability is
  written too broadly and should be split — modelling a many-to-many the page
  cannot show would hide that signal rather than surface it.

  ON DELETE SET NULL, against the CASCADE above it. Deleting a phase destroys its
  capabilities and keeps every topic: the entries stay and lose the line saying
  which capability they serve. That is the sentence the delete confirmation
  makes, so it has to be true of the database rather than of the application.

  `capability_id` is deliberately NOT added to library_page or
  practice_ordered_page, and is omitted from the domain Topic in
  src/lib/data/topic-mapping.ts. That is what lets
  src/lib/domain/phases-boundary.test.ts forbid EVERY capability column in a
  queue module with no exception — if the domain Topic carried it,
  TopicBoundaryIsSound would demand every read return it, including the queue's.
*/
alter table public.topics
  add column capability_id uuid references public.capabilities(id) on delete set null;

create index topics_capability_idx on public.topics (capability_id)
  where capability_id is not null;

/*
  ── The GRANTs, in this migration rather than a later one ───────────────────
  Arc 2 shipped a production outage from exactly this omission: `sources` was
  created with four RLS policies and no grant, and the hosted project answered
  "permission denied for table sources" — taking down every page in the (app)
  group, because a count ran in the shared layout.

  The local stack grants these through Supabase's default ACLs for new tables in
  `public`, so every local test passes either way. A hosted project does not
  apply those defaults to a table created by a migration on a running project.
  RLS is a separate gate and does not replace this one; GRANT is checked first.

  src/lib/data/table-grants.test.ts reads the migrations and fails if either
  table is missing a grant, which is the guard that did not exist in arc 2.
*/
grant select, insert, update, delete on table public.phases to authenticated;
grant select, insert, update, delete on table public.capabilities to authenticated;
