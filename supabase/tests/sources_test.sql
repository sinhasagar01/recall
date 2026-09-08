-- Sources. The first new table since the schema was built.
--
-- A source is the video or article a topic came from. It is genuinely not a
-- topic: it has no confidence, is never practised, and dies without taking its
-- children with it. That last property is the one this file exists to prove.
--
-- Written and run RED before the migration exists.

begin;
select plan(41);

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
-- affect zero rows rather than raise, so "it threw" is the wrong assertion.
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

create function tests_queue_order() returns text
language sql as $fn$
  select string_agg(title, ',' order by rn)
  from (
    select title, row_number() over () as rn
    from public.practice_ordered_page(
      array['new','weak','okay','strong']::text[], null, null, null, null, null, null, 100)
    where title in ('The backpack', 'Unsourced')
  ) q
$fn$;

select tests_create_user('00000000-0000-0000-0000-0000000000f1', 'owner@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000f2', 'other@recall.test');

-- ===========================================================================
-- The table and its shape
-- ===========================================================================
select has_table('public'::name, 'sources'::name, 'there is a sources table');
-- `columns_are` rather than a list of `has_column`, and the difference is not
-- stylistic. `has_column` is a POSITIVE assertion: it proves a column is there
-- and says nothing about a column that should not be. Arc 6 dropped
-- `caveat_noted` and added `coverage` here and this file passed without
-- comment, while topics_test.sql caught `extracted` on the same commit —
-- because that file has this and this one did not. See ARCHITECTURE.md.
select columns_are('public'::name, 'sources'::name, ARRAY[
  'id', 'user_id', 'title', 'course', 'url',
  -- The transcript is scratch: pasted, distilled from, deleted. The word count
  -- is generated so the list never reads the body, and `transcript_deleted_at`
  -- exists because "deleted" and "never had one" are different sentences.
  'transcript', 'transcript_words', 'transcript_deleted_at',
  -- Arc 6. What the video contained and what happened to each — the one thing
  -- extraction persists beyond ordinary topics, because it is the record of a
  -- decision rather than a model response.
  'coverage',
  'created_at', 'updated_at'
], 'sources has exactly these columns — additions and removals both fail here');

select col_not_null('public'::name, 'sources'::name, 'title'::name, 'a source must have a title');
select col_is_null('public'::name, 'sources'::name, 'course'::name, 'course is optional');
select col_is_null('public'::name, 'sources'::name, 'url'::name, 'url is optional');
select col_is_null('public'::name, 'sources'::name, 'transcript'::name, 'transcript is optional');

select is(
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'sources' and column_name = 'transcript_words'),
  'ALWAYS',
  'the word count is generated, so it cannot drift from the text it counts'
);

select has_column('public'::name, 'topics'::name, 'source_id'::name, 'topics has a source_id');

-- ===========================================================================
-- Ownership is a default, never a client-supplied value
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f1');

select lives_ok(
  $$insert into public.sources (title) values ('Closures')$$,
  'a title alone is enough — a lesson you took notes on paper still deserves a record'
);

select is(
  (select user_id from public.sources where title = 'Closures'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'user_id comes from the column default, never from the client'
);

select lives_ok(
  $$insert into public.sources (title, course, url, transcript)
    values ('Asynchronous JavaScript', 'JavaScript: The Hard Parts',
            'https://example.com/async', 'one two three four five')$$,
  'a source with every field is accepted'
);

select is(
  (select transcript_words from public.sources where title = 'Asynchronous JavaScript'),
  5,
  'the generated count counts words'
);

select is(
  (select transcript_words from public.sources where title = 'Closures'),
  null,
  'and is null when there is no transcript, rather than zero'
);

/*
  Blank is not a value.

  These three exist because the perturbation found them missing: relaxing any of
  the not-blank checks to `true` failed nothing, since every insert above supplies
  real text. An empty string is a lie the rest of the system then has to believe —
  a source titled '' would render as a blank row in the list.
*/
select throws_ok(
  $$insert into public.sources (title) values ('   ')$$,
  '23514', null, 'a whitespace-only title is rejected'
);

select throws_ok(
  $$insert into public.sources (title, course) values ('Fine', '')$$,
  '23514', null, 'an empty course is rejected — absent is null, not blank'
);

select throws_ok(
  $$insert into public.sources (title, url) values ('Fine', '  ')$$,
  '23514', null, 'and a whitespace-only url is rejected'
);

/*
  A forged user_id is refused.

  This assertion exists because the perturbation found it missing: relaxing the
  insert policy to `with check (true)` failed NOTHING. The tests proved the
  DEFAULT supplies user_id and that anon cannot insert — but anon is stopped by
  `to authenticated`, not by the with-check, so the clause that actually stops a
  signed-in caller writing a row into someone else's account was untested.
*/
select throws_ok(
  $$insert into public.sources (user_id, title)
    values ('00000000-0000-0000-0000-0000000000f2', 'Planted')$$,
  '42501', null, 'a signed-in caller cannot insert a source owned by someone else'
);

/*
  `throws_ok`, not `tests_affected`.

  The two halves of a policy fail differently: a `using` failure hides the row, so
  the statement affects zero and returns quietly, while a `with check` failure
  RAISES. This row is the caller's own, so `using` passes and only the with-check
  stops it — asserting a row count here aborts the whole file on the exception.
*/
select throws_ok(
  $$update public.sources set user_id = '00000000-0000-0000-0000-0000000000f2'$$,
  '42501', null, 'and cannot give one away by updating its owner'
);

-- ===========================================================================
-- RLS: four policies, and the anon case
-- ===========================================================================
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'sources'),
  4,
  'four policies, one per command'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sources'::regclass),
  'row level security is enabled — without it the policies are decoration'
);

select tests_login_as_anon();

select is(
  (select count(*)::int from public.sources),
  0,
  'a signed-out caller sees no sources at all'
);

select throws_ok(
  $$insert into public.sources (title) values ('Anon source')$$,
  '42501', null, 'and cannot insert one'
);

-- ===========================================================================
-- Cross-user isolation
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f2');

select is(
  (select count(*)::int from public.sources),
  0,
  'another signed-in user sees none of the first user''s sources'
);

select is(
  (select tests_affected($$update public.sources set title = 'Stolen'$$)),
  0,
  'and cannot update them'
);

select is(
  (select tests_affected($$delete from public.sources$$)),
  0,
  'and cannot delete them'
);

-- ===========================================================================
-- Linking, and the rule the whole arc turns on
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f1');

insert into public.topics (user_id, title, definition, source_id)
select '00000000-0000-0000-0000-0000000000f1', 'The backpack', 'A live reference.', id
from public.sources where title = 'Closures';

insert into public.topics (user_id, title, kind, options, correct_option, source_id)
select '00000000-0000-0000-0000-0000000000f1', 'What does this log?', 'quiz',
       array['a','b'], 0, id
from public.sources where title = 'Closures';

select is(
  (select count(*)::int from public.topics where source_id is not null),
  2,
  'a topic and a quiz can both link to a source'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, source_id)
    values ('00000000-0000-0000-0000-0000000000f1', 'Dangling', 'x',
            '00000000-0000-0000-0000-00000000dead')$$,
  '23503', null, 'a source_id must point at a source that exists'
);

-- A topic may have no source at all. Most will not.
select lives_ok(
  $$insert into public.topics (user_id, title, definition)
    values ('00000000-0000-0000-0000-0000000000f1', 'Unsourced', 'Learned somewhere.')$$,
  'a topic with no source is the ordinary case'
);

-- ===========================================================================
-- Deleting a source keeps its topics — ON DELETE SET NULL
--
-- The entries stay; they lose the line saying where they came from. This is the
-- sentence the delete confirmation makes, so it has to be true.
-- ===========================================================================
select lives_ok(
  $$delete from public.sources where title = 'Closures'$$,
  'a source with linked entries can be deleted'
);

select is(
  (select count(*)::int from public.topics where title in ('The backpack', 'What does this log?')),
  2,
  'both entries survive the deletion of the source they came from'
);

select is(
  (select count(*)::int from public.topics
   where title in ('The backpack', 'What does this log?') and source_id is null),
  2,
  'and their source_id is null rather than dangling'
);

-- ===========================================================================
-- The transcript is scratch: deleting it leaves the source intact
-- ===========================================================================
select lives_ok(
  $$update public.sources set transcript = null, transcript_deleted_at = now()
    where title = 'Asynchronous JavaScript'$$,
  'a transcript can be deleted on its own'
);

select is(
  (select title || ' · ' || coalesce(course, '—') from public.sources
   where title = 'Asynchronous JavaScript'),
  'Asynchronous JavaScript · JavaScript: The Hard Parts',
  'the source record survives its transcript'
);

select ok(
  (select transcript_deleted_at is not null from public.sources
   where title = 'Asynchronous JavaScript'),
  'and records that it WAS deleted, which is a different state from never having had one'
);

-- ===========================================================================
-- A source never reaches the queue
--
-- The source-level guard is src/lib/domain/sources-boundary.test.ts, which fails
-- on the mere mention of a source column in a queue module. This asserts the
-- outcome where the ordering actually runs.
-- ===========================================================================
select is(
  (select count(*)::int from public.practice_ordered_page(
     array['new','weak','okay','strong']::text[], null, null, null, null, null, null, 100)
   where title = 'Asynchronous JavaScript'),
  0,
  'a source is not a row the practice queue can return'
);

/*
  Invariance, not a fixed sequence.

  The first version of this asserted a hard-coded order and failed — because the
  two topics tie on staleness and the tie-break falls through to
  `created_at desc`, which put them the other way round. That was the assertion
  being wrong, not the queue. What the claim actually is: attaching a source
  changes nothing, so the honest test compares the order to ITSELF across the
  attach.
*/
-- Held in a session setting rather than a temp table: the test is running as
-- `authenticated` by this point, which may not create objects in public.
select set_config('tests.queue_before', tests_queue_order(), false);

insert into public.sources (title) values ('Rendering patterns');
update public.topics set source_id = (select id from public.sources where title = 'Rendering patterns')
where title = 'The backpack';

select is(
  tests_queue_order(),
  current_setting('tests.queue_before'),
  'attaching a source does not reorder the queue'
);

select isnt(
  current_setting('tests.queue_before'),
  '',
  'and the control is a real order rather than an empty string comparing equal to itself'
);

-- ===========================================================================
-- Table privileges
--
-- RLS and GRANT are two independent gates, and only one of them fails loudly.
-- This arc learned that the hard way: every assertion above passed, the e2e suite
-- passed against a real Supabase, and the hosted project still answered
-- "permission denied for table sources" — taking down every page in the (app)
-- group, because countSources() runs in the shared layout. The policies were
-- correct throughout and irrelevant, since GRANT is checked first.
--
-- Note what these four do and do not buy. The local stack grants them through
-- Supabase's default ACLs for new tables in `public`, so they pass here whether
-- or not *_sources_grants.sql exists — they catch a fresh database, not this
-- mistake. The test that catches this mistake is table-grants.test.ts, which
-- reads the migrations and asserts every created table has an explicit grant.
--
-- Asked per privilege rather than with table_privs_are(), which asserts an exact
-- set: pinning the full default ACL would make this fail on any platform change
-- that has nothing to do with what the app needs.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.sources', 'SELECT'),
  'authenticated may SELECT sources');
select ok(has_table_privilege('authenticated', 'public.sources', 'INSERT'),
  'authenticated may INSERT sources');
select ok(has_table_privilege('authenticated', 'public.sources', 'UPDATE'),
  'authenticated may UPDATE sources');
select ok(has_table_privilege('authenticated', 'public.sources', 'DELETE'),
  'authenticated may DELETE sources');

select * from finish();
rollback;
