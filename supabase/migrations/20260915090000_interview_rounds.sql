-- Arc 7, session one — interview mode.
--
-- A timed mock interview built from your own library. One table, one row per
-- COMPLETED round, and every column is a number.
--
-- ── What is not here is the point ───────────────────────────────────────────
-- There is no `summary`, no `transcript`, no `notes`. The scorecard shows an
-- overall summary, a sentence per dimension and a note per question — all of it
-- model prose, all of it rendered once from the response that produced the
-- numbers and never written down. Storing it would build the second library this
-- product has refused for seven arcs.
--
-- The cost, stated rather than discovered: revisiting a past round gives you its
-- numbers, not its narrative. That is the right side of the trade, and it is
-- consistent with everything the reference draws of a past round — the sparkline
-- is five numbers and "+9 vs last" is a number.
--
-- ── One insert, at the end ──────────────────────────────────────────────────
-- The conversation lives in the browser and is posted to a server action each
-- turn. Nothing exists in the database until the scorecard is written, so a round
-- you abandoned leaves NOTHING — by construction, not by cleanup. Same shape as
-- arc 5's "a day with nothing typed has no row".

create table public.interview_rounds (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade
                        default auth.uid(),

  /*
    Session one ships five types. DSA and System design are absent from the setup
    screen entirely — absent, not disabled — so they are absent from the CHECK
    too. A sixth arrives with its runner, not before it.
  */
  round_type          text not null,
  minutes             integer not null,
  level               text not null,

  /*
    ── Counted in code, never judged by a model ──────────────────────────────
    Anything countable is counted. The model is asked for judgement about what was
    said and for nothing else, so these arrive from the runner and are rendered
    BESIDE the scores rather than mixed into them — a wrong count is then a
    visible disagreement rather than a silently different number.
  */
  asked               integer not null,
  answered            integer not null,
  follow_ups_offered  integer not null,
  follow_ups_held     integer not null,
  questions_asked     integer not null,
  hints_used          integer not null,

  /*
    The clock is advisory: the question count ends the round, because a hard stop
    can destroy an answer mid-sentence in a round that is never resumed. Its teeth
    are these two columns — going twenty minutes long is visible on the scorecard
    and in the comparison against past rounds.
  */
  elapsed_seconds     integer not null,
  over_by_seconds     integer not null default 0,

  /* The model's judgement of what was said. Four dimensions and the roll-up. */
  recall              integer not null,
  depth               integer not null,
  precision           integer not null,
  enquiry             integer not null,
  overall             integer not null,

  /* Which topics it drew on, so the scorecard can offer to mark them weak. */
  topic_ids           uuid[] not null default '{}',

  created_at          timestamptz not null default now(),

  constraint interview_rounds_type_is_known
    check (round_type in ('javascript', 'react', 'typescript', 'behavioural', 'mixed')),
  constraint interview_rounds_level_is_known
    check (level in ('friendly', 'staff', 'skeptical')),
  constraint interview_rounds_minutes_is_offered
    check (minutes in (20, 45, 60, 90)),

  /*
    0–100 is the scale the whole mode is built on: the ring, the dimension bars
    and the sparkline all divide by 100. A model returning 137 must fail here
    rather than render as a bar wider than its track.
  */
  constraint interview_rounds_scores_are_a_scale check (
    recall    between 0 and 100 and
    depth     between 0 and 100 and
    precision between 0 and 100 and
    enquiry   between 0 and 100 and
    overall   between 0 and 100
  ),

  /*
    ── Figures that must reconcile with each other ───────────────────────────
    The reference's scorecard claimed 11 of 14 follow-ups held over a question
    list whose ceiling was 9 — not a wrong number but an impossible one, sitting
    beside the decision that makes these code-counted. Recorded in TASKS.md as
    the seventh way a reference can be wrong.

    These are the pairs that cannot both be free.
  */
  constraint interview_rounds_counts_reconcile check (
    asked >= 0
    and answered between 0 and asked
    and follow_ups_offered >= 0
    and follow_ups_held between 0 and follow_ups_offered
    and questions_asked >= 0
    and hints_used >= 0
  ),

  constraint interview_rounds_time_is_positive
    check (elapsed_seconds >= 0 and over_by_seconds >= 0)
);

/* The sparkline: this user's rounds of one type, newest first. */
create index interview_rounds_user_type_idx
  on public.interview_rounds (user_id, round_type, created_at desc);

alter table public.interview_rounds enable row level security;

-- Four policies, one per command. `(select auth.uid())` rather than a bare call
-- so the planner evaluates it once per statement instead of per row.
create policy interview_rounds_select_own on public.interview_rounds
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy interview_rounds_insert_own on public.interview_rounds
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy interview_rounds_update_own on public.interview_rounds
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy interview_rounds_delete_own on public.interview_rounds
  for delete to authenticated
  using ((select auth.uid()) = user_id);

/*
  The GRANT, in the same migration as the table.

  RLS and GRANT are independent gates and only one fails loudly: without a policy
  you get zero rows and no error; without the grant you get a 500 on every page in
  the group. `sources` shipped without this twice. No local test can catch the
  omission — Supabase's default ACLs cover it here — which is why
  table-grants.test.ts reads the migrations instead.
*/
grant select, insert, update, delete on table public.interview_rounds to authenticated;
