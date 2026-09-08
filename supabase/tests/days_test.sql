-- Today. One row per date per user.
--
-- The three things this file exists to prove: one row per day and no second one;
-- an empty line cannot be ticked; and nothing here can carry, count or streak,
-- because the exact column set says so.
--
-- Written and run RED before the migration exists.

begin;
select plan(47);

create function tests_create_user(uid uuid, email text) returns uuid
language plpgsql as $fn$
begin
  insert into auth.users (id, email) values (uid, email);
  return uid;
end $fn$;

create function tests_login_as(uid uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $fn$;

-- A `using` failure affects zero rows rather than raising; a `with check` failure
-- DOES raise. Both shapes appear below.
create function tests_affected(stmt text) returns int
language plpgsql as $fn$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- A signed-out caller. The publishable key is public, so anyone can call
-- PostgREST as `anon` with no JWT at all.
create function tests_login_as_anon() returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $fn$;

-- Hoisted above the first tests_login_as: `create function` needs privileges the
-- `authenticated` role does not have. Arc 2 learned this the hard way.
create function tests_queue_order() returns text
language sql as $fn$
  select string_agg(title, ',' order by rn)
  from (
    select title, row_number() over () as rn
    from public.practice_ordered_page(
      array['new','weak','okay','strong']::text[], null, null, null, null, null, null, 100)
    where title in ('Day topic', 'Other topic')
  ) q
$fn$;

select tests_create_user('00000000-0000-0000-0000-0000000000f1', 'owner@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000f2', 'other@recall.test');

-- ===========================================================================
-- The table, and the columns it deliberately does not have
-- ===========================================================================
select has_table('public'::name, 'days'::name, 'there is a days table');

select has_column('public'::name, 'days'::name, 'day'::name, 'a day has a date');
select has_column('public'::name, 'days'::name, 'explain_text'::name, 'one thing to explain');
select has_column('public'::name, 'days'::name, 'rebuild_text'::name, 'one thing to rebuild');
select has_column('public'::name, 'days'::name, 'apply_text'::name, 'one thing to apply');
select has_column('public'::name, 'days'::name, 'blocker_text'::name, 'and a blocker');
select has_column('public'::name, 'days'::name, 'blocker_resolved_at'::name,
  'which outlives its day until resolved');

select col_not_null('public'::name, 'days'::name, 'day'::name, 'a row is always for some day');
select col_is_null('public'::name, 'days'::name, 'explain_text'::name,
  'a slot may be empty and still keep its place');

/*
  A calendar date, not an instant. Storing a timestamptz would re-introduce the
  timezone question the local-date helper exists to answer once, and would make
  "which day is this" depend on where it is read.
*/
select col_type_is('public'::name, 'days'::name, 'day'::name, 'date',
  'the day is a DATE — an instant would make the calendar day depend on the reader');

/*
  ── Nothing carries, counts or streaks ──────────────────────────────────────
  The exact column set. Yesterday's unticked lines are PREFILLED, not carried, so
  there is no lineage to store — and no column here that a streak, a completion
  rate or a "carried · 2 days" badge could be computed from without a migration
  that has to argue for itself.
*/
select columns_are('public'::name, 'days'::name,
  array['id', 'user_id', 'day',
        'explain_text', 'explain_done', 'rebuild_text', 'rebuild_done',
        'apply_text', 'apply_done',
        'blocker_text', 'blocker_resolved_at', 'created_at', 'updated_at'],
  'days has exactly these columns — nothing to carry, count or streak from');

select hasnt_column('public'::name, 'days'::name, 'carried_days'::name,
  'prefill is not carry: there is no lineage to count');
select hasnt_column('public'::name, 'days'::name, 'streak'::name,
  'no streak — the line goes quiet and that is the whole reward');

-- ===========================================================================
-- Ownership is a default, never a client-supplied value
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f1');

select lives_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-08', 'Finish closures')$$,
  'a day with one line is a real day'
);

select is(
  (select user_id from public.days where day = '2026-09-08'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'user_id comes from the column default, never from the client'
);

select is(
  (select explain_done from public.days where day = '2026-09-08'),
  false, 'a new line starts unticked'
);

select throws_ok(
  $$insert into public.days (user_id, day, explain_text)
    values ('00000000-0000-0000-0000-0000000000f2', '2026-09-01', 'Not mine')$$,
  '42501', null,
  'a day cannot be written on behalf of someone else'
);

/*
  The owner-reassignment update. Labelled for what it proves: arc 3 showed by
  perturbation that relaxing the UPDATE policy's `with check` alone leaves this
  green, because Postgres applies the SELECT policy to the NEW row and the two
  predicates are the same expression. This asserts the row cannot be moved to
  another owner, and is not evidence about the update policy's with-check clause.
*/
select throws_ok(
  $$update public.days set user_id = '00000000-0000-0000-0000-0000000000f2'
    where day = '2026-09-08'$$,
  '42501', null,
  'a day cannot be moved to another owner — the new row would not be yours to see'
);

-- ===========================================================================
-- One row per day
-- ===========================================================================
select throws_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-08', 'A second morning')$$,
  '23505', null,
  'a second row for the same day is refused — one morning, one record'
);

select lives_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-09', 'A different day')$$,
  'but the next day is a different row'
);

select is(
  (select count(*)::int from public.days), 2,
  'two days, two rows'
);

-- ===========================================================================
-- Every CHECK bites
-- ===========================================================================
select throws_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-10', '   ')$$,
  '23514', null, 'a whitespace-only intention is refused — leave it empty instead'
);

select throws_ok(
  $$insert into public.days (day, rebuild_text) values ('2026-09-10', '')$$,
  '23514', null, 'an empty rebuild line is refused'
);

select throws_ok(
  $$insert into public.days (day, apply_text) values ('2026-09-10', '  ')$$,
  '23514', null, 'a whitespace-only apply line is refused'
);

select throws_ok(
  $$insert into public.days (day, blocker_text) values ('2026-09-10', ' ')$$,
  '23514', null, 'a whitespace-only blocker is refused'
);

/*
  An empty line cannot be ticked. The UI renders its box as a span rather than a
  control; this is the same rule where it cannot be worked around.
*/
select throws_ok(
  $$insert into public.days (day, explain_done) values ('2026-09-10', true)$$,
  '23514', null, 'a done flag with no text is a claim about nothing'
);

/*
  Its own day, deliberately.

  Every throws_ok above inserts into 2026-09-10 and is expected to throw. If any
  of those CHECKs is relaxed, its insert SUCCEEDS — and this row then collides
  with it on the unique constraint, so one perturbation reports two failures.
  That is the arc 4 lesson ("count by the thing under test") in a second shape: a
  shared fixture key couples assertions just as a table total does. An assertion
  should fail for its own reason.
*/
select lives_ok(
  $$insert into public.days (day, rebuild_text, rebuild_done)
    values ('2026-09-11', 'Something', true)$$,
  'but a line with text may be ticked'
);

select throws_ok(
  $$insert into public.days (day, blocker_resolved_at)
    values ('2026-09-10', now())$$,
  '23514', null, 'you cannot resolve a blocker you never wrote'
);

-- ===========================================================================
-- The blocker outlives its day, and is found without a scan
-- ===========================================================================
insert into public.days (day, explain_text, blocker_text)
values ('2026-09-05', 'Friday', 'Debounced search still fires after unmount');

insert into public.days (day, explain_text, blocker_text, blocker_resolved_at)
values ('2026-09-06', 'Saturday', 'Audit writes in the same transaction?', now());

insert into public.days (day, explain_text, blocker_text)
values ('2026-09-07', 'Sunday', 'Where should the abort signal live?');

select is(
  (select blocker_text from public.days
    where blocker_text is not null and blocker_resolved_at is null and day < '2026-09-08'
    order by day asc limit 1),
  'Debounced search still fires after unmount',
  'the OLDEST unresolved blocker is the one carried — it is the one most at risk of being forgotten'
);

select is(
  (select count(*)::int from public.days
    where blocker_text is not null and blocker_resolved_at is null and day < '2026-09-08'),
  2, 'and the page can say how many others are open without listing them'
);

select isnt(
  (select blocker_text from public.days where day = '2026-09-06'),
  null, 'resolving keeps the text — it stamps a date, it does not delete what you wrote'
);

select has_index('public'::name, 'days'::name, 'days_open_blocker_idx'::name,
  'the open blocker is found by an index, never by scanning every day');

-- ===========================================================================
-- The queue cannot see any of this
-- ===========================================================================
insert into public.topics (user_id, title, definition)
values ('00000000-0000-0000-0000-0000000000f1', 'Day topic', 'A topic.'),
       ('00000000-0000-0000-0000-0000000000f1', 'Other topic', 'Another.');

select set_config('tests.queue_before', coalesce(tests_queue_order(), ''), true);

insert into public.days (day, explain_text, rebuild_text, apply_text, explain_done)
values ('2026-09-04', 'Should not move the queue', 'Nor this', 'Nor this either', true);

select is(
  tests_queue_order(),
  current_setting('tests.queue_before'),
  'writing a day does not change what practice queues, or in what order'
);

select isnt(
  current_setting('tests.queue_before'), '',
  'and the control is a real order rather than an empty string comparing equal to itself'
);

-- ===========================================================================
-- Cross-user isolation
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f2');

select is(
  (select count(*)::int from public.days), 0,
  'another user sees none of your days'
);

select is(
  tests_affected($$update public.days set explain_text = 'Stolen'$$), 0,
  'another user cannot rewrite your morning'
);

select is(
  tests_affected($$update public.days set explain_done = true$$), 0,
  'another user cannot tick your box'
);

select is(
  tests_affected($$delete from public.days$$), 0,
  'another user cannot delete your day'
);

/*
  The same date belongs to each of you independently. The unique constraint is on
  (user_id, day), not on day — asserted here rather than assumed, because a
  constraint on `day` alone would pass every test above and lock out the second
  user of a multi-user product.
*/
select lives_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-08', 'My own morning')$$,
  'another user may have their own row for the same date'
);

-- ===========================================================================
-- Signed out
-- ===========================================================================
select tests_login_as_anon();

select is(
  (select count(*)::int from public.days), 0,
  'a signed-out caller sees no days'
);

select throws_ok(
  $$insert into public.days (day, explain_text) values ('2026-09-08', 'Anonymous')$$,
  null, null,
  'a signed-out caller cannot write a day'
);

/*
  The stronger form. The count above passes on the local stack because default
  ACLs happen to grant anon a SELECT it then finds no rows through; on a hosted
  project anon has no grant at all. Asserting that no POLICY admits anon is true
  in both, and is the thing actually intended.
*/
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'days'
      and roles::text <> '{authenticated}'),
  0, 'every policy is scoped to authenticated, never anon'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'days'),
  4, 'four policies, one per command'
);

-- ===========================================================================
-- Table privileges
--
-- Arc 2 shipped an outage because a new table had RLS and no grant. Arcs 3 and 4
-- proved these four cannot catch that: the local stack grants new public tables
-- through default ACLs whether or not a migration says so, so removing the grant
-- leaves this file green. They catch a fresh database. The guard for a forgotten
-- grant migration is src/lib/data/table-grants.test.ts, which reads the SQL.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.days', 'SELECT'),
  'authenticated may SELECT days');
select ok(has_table_privilege('authenticated', 'public.days', 'INSERT'),
  'authenticated may INSERT days');
select ok(has_table_privilege('authenticated', 'public.days', 'UPDATE'),
  'authenticated may UPDATE days');
select ok(has_table_privilege('authenticated', 'public.days', 'DELETE'),
  'authenticated may DELETE days');

select * from finish();
rollback;
