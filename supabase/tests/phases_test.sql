-- Phases and capabilities.
--
-- A phase is a stretch of weeks; a capability is one of the things you will be
-- able to do at the end of it. Neither is a topic: no confidence, never
-- practised, never graded.
--
-- Two cascade shapes in one arc, pointing opposite ways, and this file exists to
-- prove both: deleting a phase DESTROYS its capabilities and KEEPS every topic.
--
-- Written and run RED before the migration exists.

begin;
select plan(59);

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

-- How many rows a statement actually touched. RLS makes an unauthorised update
-- affect zero rows rather than raise, so "it threw" is the wrong assertion for a
-- `using` failure. A `with check` failure DOES raise — see the two shapes below.
create function tests_affected(stmt text) returns int
language plpgsql as $fn$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- A signed-out caller. The real threat model: the publishable key is public, so
-- anyone can call PostgREST as `anon` with no JWT at all.
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
    where title in ('Event loop', 'Uncapable')
  ) q
$fn$;

select tests_create_user('00000000-0000-0000-0000-0000000000f1', 'owner@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000f2', 'other@recall.test');

-- ===========================================================================
-- The tables and their shape
-- ===========================================================================
select has_table('public'::name, 'phases'::name, 'there is a phases table');
select has_table('public'::name, 'capabilities'::name, 'there is a capabilities table');

select has_column('public'::name, 'phases'::name, 'name'::name, 'a phase has a name');
select has_column('public'::name, 'phases'::name, 'when_text'::name,
  'a phase has a free-text when');
select has_column('public'::name, 'phases'::name, 'sources_text'::name,
  'a phase has a free-text sources line');

select col_not_null('public'::name, 'phases'::name, 'name'::name, 'a phase must have a name');
select col_is_null('public'::name, 'phases'::name, 'when_text'::name, 'when is optional');
select col_is_null('public'::name, 'phases'::name, 'sources_text'::name, 'sources is optional');

select has_column('public'::name, 'capabilities'::name, 'phase_id'::name,
  'a capability belongs to a phase');
select has_column('public'::name, 'capabilities'::name, 'name'::name, 'a capability has a name');
select col_not_null('public'::name, 'capabilities'::name, 'phase_id'::name,
  'a capability cannot exist outside a phase');
select col_not_null('public'::name, 'capabilities'::name, 'name'::name,
  'a capability must say what you will be able to do');

select has_column('public'::name, 'topics'::name, 'capability_id'::name,
  'topics has a capability_id');

/*
  "When" is text, and this is where that is enforced. A date column is the thing
  the whole screen refuses: it would let the product work out that you are
  behind. Asserted on the type rather than trusted to the comment above it.
*/
select col_type_is('public'::name, 'phases'::name, 'when_text'::name, 'text',
  'when is TEXT — a date column is what lets a product tell you that you are late');

/*
  ── No stored "demonstrated" ────────────────────────────────────────────────
  The exact column set of each table, so a boolean cannot be added later without
  failing a test that says why it must not be. `columns_are` is the assertion
  that makes "no manual tick" structural rather than a convention.
*/
select columns_are('public'::name, 'phases'::name,
  array['id', 'user_id', 'name', 'when_text', 'sources_text', 'created_at', 'updated_at'],
  'phases has exactly these columns — no demonstrated, no progress, no dates');

select columns_are('public'::name, 'capabilities'::name,
  array['id', 'user_id', 'phase_id', 'name', 'created_at', 'updated_at'],
  'capabilities has exactly these columns — demonstrated is derived, never stored');

select hasnt_column('public'::name, 'capabilities'::name, 'demonstrated'::name,
  'there is no boolean for a manual tick to write to');

-- ===========================================================================
-- Ownership is a default, never a client-supplied value
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f1');

select lives_ok(
  $$insert into public.phases (name) values ('Core engineering foundations')$$,
  'a name alone is enough — when and sources are both optional'
);

select is(
  (select user_id from public.phases where name = 'Core engineering foundations'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'user_id comes from the column default, never from the client'
);

select lives_ok(
  $$insert into public.phases (name, when_text, sources_text)
    values ('Senior and staff frontend', 'Weeks 3-7', 'React and TypeScript')$$,
  'a phase with every field is accepted'
);

/*
  The forged-owner insert. A `with check` failure RAISES (42501), so throws_ok is
  the right shape here — tests_affected would abort the whole file on the error.
*/
select throws_ok(
  $$insert into public.phases (user_id, name)
    values ('00000000-0000-0000-0000-0000000000f2', 'Not mine')$$,
  '42501', null,
  'a phase cannot be inserted on behalf of someone else'
);

select lives_ok(
  $$insert into public.capabilities (phase_id, name)
    select id, 'Explain the event loop without notes'
    from public.phases where name = 'Core engineering foundations'$$,
  'a capability is accepted'
);

select is(
  (select user_id from public.capabilities where name = 'Explain the event loop without notes'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'a capability''s user_id comes from the default too'
);

select throws_ok(
  $$insert into public.capabilities (user_id, phase_id, name)
    select '00000000-0000-0000-0000-0000000000f2', id, 'Not mine'
    from public.phases where name = 'Core engineering foundations'$$,
  '42501', null,
  'a capability cannot be inserted on behalf of someone else'
);

/*
  The owner-reassignment update.

  Labelled carefully, because perturbation proved the obvious label wrong. This
  looks like a test of the UPDATE policy's `with check`, and it is not: relaxing
  that clause alone to `with check (true)` leaves the suite GREEN. Relaxing the
  SELECT policy to `using (true)` is what lets the reassignment through.

  The reason is that Postgres applies the SELECT policy to the NEW row on update:
  handing the row to someone else would make it invisible to you, and that is
  refused before the update policy's check is reached. The two predicates are the
  same expression, so no statement can separate them — the update `with check` is
  defence in depth here and is not independently observable.

  So this asserts what it can actually prove: the row cannot be moved to another
  owner. It is not evidence about the update policy's `with check` clause, and
  saying so would be the kind of assertion that passes for a reason nobody checked.
*/
select throws_ok(
  $$update public.phases set user_id = '00000000-0000-0000-0000-0000000000f2'
    where name = 'Core engineering foundations'$$,
  '42501', null,
  'a phase cannot be moved to another owner — the new row would not be yours to see'
);

select throws_ok(
  $$update public.capabilities set user_id = '00000000-0000-0000-0000-0000000000f2'
    where name = 'Explain the event loop without notes'$$,
  '42501', null,
  'a capability cannot be moved to another owner, for the same reason'
);

-- ===========================================================================
-- Every CHECK bites
-- ===========================================================================
select throws_ok(
  $$insert into public.phases (name) values ('   ')$$,
  '23514', null, 'a whitespace-only phase name is refused'
);

select throws_ok(
  $$insert into public.phases (name, when_text) values ('P', '')$$,
  '23514', null, 'an empty when is refused — omit it instead'
);

select throws_ok(
  $$insert into public.phases (name, sources_text) values ('P', '  ')$$,
  '23514', null, 'a whitespace-only sources line is refused'
);

select throws_ok(
  $$insert into public.capabilities (phase_id, name)
    select id, ' ' from public.phases where name = 'Core engineering foundations'$$,
  '23514', null, 'a blank capability name is refused'
);

select throws_ok(
  $$insert into public.capabilities (phase_id, name)
    values ('00000000-0000-0000-0000-00000000dead', 'Orphan')$$,
  '23503', null, 'a capability cannot point at a phase that does not exist'
);

-- ===========================================================================
-- The two cascades, pointing opposite ways
-- ===========================================================================
insert into public.capabilities (phase_id, name)
select id, 'Trace a click end to end'
from public.phases where name = 'Core engineering foundations';

insert into public.topics (user_id, title, definition, capability_id)
select '00000000-0000-0000-0000-0000000000f1', 'Event loop', 'A queue and a stack.', id
from public.capabilities where name = 'Explain the event loop without notes';

insert into public.topics (user_id, title, kind, options, correct_option, capability_id)
select '00000000-0000-0000-0000-0000000000f1', 'Which runs first?', 'quiz',
       array['micro','macro'], 0, id
from public.capabilities where name = 'Explain the event loop without notes';

insert into public.topics (user_id, title, definition, capability_id)
select '00000000-0000-0000-0000-0000000000f1', 'DNS', 'A phone book.', id
from public.capabilities where name = 'Trace a click end to end';

-- A topic may serve no capability at all. Most will not.
insert into public.topics (user_id, title, definition)
values ('00000000-0000-0000-0000-0000000000f1', 'Uncapable', 'Serves nothing.');

select is(
  (select count(*)::int from public.topics where capability_id is not null),
  3, 'three topics are linked to a capability'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, capability_id)
    values ('00000000-0000-0000-0000-0000000000f1', 'Dangling', 'x',
            '00000000-0000-0000-0000-00000000dead')$$,
  '23503', null, 'a capability_id must point at a capability that exists'
);

-- Deleting ONE capability nulls its topics and leaves them standing.
delete from public.capabilities where name = 'Trace a click end to end';

select is(
  (select count(*)::int from public.topics where title = 'DNS'),
  1, 'deleting a capability keeps the topic that served it'
);

select is(
  (select capability_id from public.topics where title = 'DNS'),
  null, 'and the topic loses the line saying which capability it served'
);

-- Deleting the PHASE destroys its capabilities and still keeps every topic.
delete from public.phases where name = 'Core engineering foundations';

select is(
  (select count(*)::int from public.capabilities), 0,
  'deleting a phase deletes its capabilities — a capability outlives nothing'
);

select is(
  (select count(*)::int from public.topics
    where title in ('Event loop', 'Which runs first?', 'DNS', 'Uncapable')),
  4, 'deleting a phase keeps every topic, including the quiz'
);

select is(
  (select count(*)::int from public.topics where capability_id is not null), 0,
  'and every one of them lost only the capability line'
);

-- ===========================================================================
-- The queue cannot see any of this
-- ===========================================================================
select set_config('tests.queue_before', coalesce(tests_queue_order(), ''), true);

insert into public.phases (name) values ('Queue check');
insert into public.capabilities (phase_id, name)
select id, 'Should not move the queue' from public.phases where name = 'Queue check';
update public.topics set capability_id =
  (select id from public.capabilities where name = 'Should not move the queue')
where title = 'Event loop';

select is(
  tests_queue_order(),
  current_setting('tests.queue_before'),
  'attaching a capability does not change what practice queues, or in what order'
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
  (select count(*)::int from public.phases), 0,
  'another user sees none of your phases'
);

select is(
  (select count(*)::int from public.capabilities), 0,
  'another user sees none of your capabilities'
);

/*
  A `using` failure does NOT raise — the row is invisible, so the statement
  affects zero rows and succeeds. That is why these are tests_affected and the
  forged-owner cases above are throws_ok.
*/
select is(
  tests_affected($$update public.phases set name = 'Stolen'$$), 0,
  'another user cannot rename your phase'
);

select is(
  tests_affected($$delete from public.phases$$), 0,
  'another user cannot delete your phase'
);

select is(
  tests_affected($$update public.capabilities set name = 'Stolen'$$), 0,
  'another user cannot rename your capability'
);

select is(
  tests_affected($$delete from public.capabilities$$), 0,
  'another user cannot delete your capability'
);

-- ===========================================================================
-- Signed out
-- ===========================================================================
select tests_login_as_anon();

select is(
  (select count(*)::int from public.phases), 0,
  'a signed-out caller sees no phases'
);

select is(
  (select count(*)::int from public.capabilities), 0,
  'a signed-out caller sees no capabilities'
);

select throws_ok(
  $$insert into public.phases (name) values ('Anonymous')$$,
  null, null,
  'a signed-out caller cannot create a phase'
);

/*
  The stronger form of the same claim. The counts above pass on the local stack
  because Supabase's default ACLs happen to grant anon a SELECT it then finds no
  rows through; on a hosted project anon has no grant at all. Asserting that no
  POLICY admits anon is true in both, and is the thing actually intended.
*/
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('phases', 'capabilities')
      and roles::text <> '{authenticated}'),
  0, 'every policy on both tables is scoped to authenticated, never anon'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('phases', 'capabilities')),
  8, 'four policies per table, one per command'
);

-- ===========================================================================
-- Table privileges
--
-- RLS and GRANT are two independent gates, and only one fails loudly. Arc 2
-- shipped a production outage because `sources` had four policies and no grant:
-- every page in the (app) group answered 500 with "permission denied for table
-- sources", and no local test could have caught it, because the local stack
-- grants new public tables through default ACLs whether or not the migration
-- does.
--
-- These four-per-table catch a fresh database. The test that catches a forgotten
-- grant migration is src/lib/data/table-grants.test.ts, which reads the SQL.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.phases', 'SELECT'),
  'authenticated may SELECT phases');
select ok(has_table_privilege('authenticated', 'public.phases', 'INSERT'),
  'authenticated may INSERT phases');
select ok(has_table_privilege('authenticated', 'public.phases', 'UPDATE'),
  'authenticated may UPDATE phases');
select ok(has_table_privilege('authenticated', 'public.phases', 'DELETE'),
  'authenticated may DELETE phases');

select ok(has_table_privilege('authenticated', 'public.capabilities', 'SELECT'),
  'authenticated may SELECT capabilities');
select ok(has_table_privilege('authenticated', 'public.capabilities', 'INSERT'),
  'authenticated may INSERT capabilities');
select ok(has_table_privilege('authenticated', 'public.capabilities', 'UPDATE'),
  'authenticated may UPDATE capabilities');
select ok(has_table_privilege('authenticated', 'public.capabilities', 'DELETE'),
  'authenticated may DELETE capabilities');

select * from finish();
rollback;
