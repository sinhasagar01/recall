-- Evidence on a topic. The constraints are the feature.
--
-- Three markers, each absent or present with a date, a required note and an
-- optional URL. A quiz carries none of them: a quiz is a retrieval device, not a
-- concept, so there is nothing to rebuild or apply.
--
-- Written and run RED before the migration exists.
--
-- The coupling is stated as scalar NULL comparisons rather than as a jsonb shape,
-- deliberately. `(a is null) = (b is null)` is a boolean either way and cannot
-- itself be NULL, which is the failure this schema has now been bitten by three
-- times.
--
-- Every clause in the constraint was perturbed against this file. All of them bite
-- except the `note is null or` disjunct, which is redundant — see the migration for
-- why it cannot change an outcome, and why it stays anyway. Four of these
-- assertions exist BECAUSE the perturbation run found them missing: the challenge
-- and production guards failed nothing until something put a blank note and a
-- stray URL on those markers too.

begin;
select plan(34);

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

select tests_create_user('00000000-0000-0000-0000-0000000000e1', 'evidence@recall.test');
select tests_login_as('00000000-0000-0000-0000-0000000000e1');

-- ===========================================================================
-- The columns
-- ===========================================================================
select has_column('public'::name, 'topics'::name, 'rebuild_at'::name, 'topics has rebuild_at');
select has_column('public'::name, 'topics'::name, 'rebuild_note'::name, 'topics has rebuild_note');
select has_column('public'::name, 'topics'::name, 'rebuild_url'::name, 'topics has rebuild_url');
select has_column('public'::name, 'topics'::name, 'challenge_at'::name, 'topics has challenge_at');
select has_column('public'::name, 'topics'::name, 'production_at'::name, 'topics has production_at');

select col_type_is('public'::name, 'topics'::name, 'rebuild_at'::name, 'date',
  'a marker carries a date, not a timestamptz — the input is type=date and the display is "Aug 28"');

-- ===========================================================================
-- Nothing recorded is the ordinary case
-- ===========================================================================
select lives_ok(
  $$insert into public.topics (user_id, title, definition)
    values ('00000000-0000-0000-0000-0000000000e1', 'No evidence', 'The ordinary case.')$$,
  'a topic with no evidence at all is accepted'
);

select is(
  (select count(*)::int from public.topics
   where title = 'No evidence' and rebuild_at is null and challenge_at is null and production_at is null),
  1,
  'and the markers default to absent rather than to anything'
);

-- ===========================================================================
-- A complete marker
-- ===========================================================================
select lives_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_at, rebuild_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Rebuilt', 'x', '2026-08-28', 'once() from memory')$$,
  'a date and a note are enough — the URL is optional'
);

select lives_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_at, rebuild_note, rebuild_url)
    values ('00000000-0000-0000-0000-0000000000e1', 'Rebuilt with a link', 'x', '2026-08-28',
            'once() from memory', 'https://gist.github.com/x')$$,
  'a URL alongside a date and a note is accepted'
);

select lives_ok(
  $$insert into public.topics (user_id, title, definition,
      rebuild_at, rebuild_note, challenge_at, challenge_note, production_at, production_note, production_url)
    values ('00000000-0000-0000-0000-0000000000e1', 'All three', 'x',
            '2026-08-28', 'debounce() from memory',
            '2026-09-01', 'Stale search responses',
            '2026-09-04', 'Search cancellation in the capstone', 'https://example.com/adr-002')$$,
  'all three markers on one topic is accepted — there is no completion state, just three entries'
);

-- ===========================================================================
-- The coupling: a date and a note arrive together or not at all
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_at)
    values ('00000000-0000-0000-0000-0000000000e1', 'Date only', 'x', '2026-08-28')$$,
  '23514', null, 'a date without a note is rejected — the note is what makes it evidence'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Note only', 'x', 'once() from memory')$$,
  '23514', null, 'a note without a date is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_url)
    values ('00000000-0000-0000-0000-0000000000e1', 'URL only', 'x', 'https://example.com')$$,
  '23514', null, 'a URL with no marker to hang on is rejected'
);

-- ===========================================================================
-- An empty note is not a note
--
-- This is the clause that can evaluate to NULL, and the only one that needs a
-- guard. Both spellings of "empty" are tested because btrim is what separates
-- them.
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_at, rebuild_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Empty note', 'x', '2026-08-28', '')$$,
  '23514', null, 'an empty note is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, rebuild_at, rebuild_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Blank note', 'x', '2026-08-28', '   ')$$,
  '23514', null, 'a whitespace-only note is rejected'
);

-- ===========================================================================
-- Each marker is governed independently
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, definition, challenge_at)
    values ('00000000-0000-0000-0000-0000000000e1', 'Challenge date only', 'x', '2026-09-01')$$,
  '23514', null, 'challenge is governed by the same coupling as rebuild'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, production_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Production note only', 'x', 'shipped it')$$,
  '23514', null, 'and so is production'
);

select lives_ok(
  $$insert into public.topics (user_id, title, definition, challenge_at, challenge_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Only challenge', 'x', '2026-09-01', 'a constrained variant')$$,
  'a marker can be present while the other two are absent'
);

/*
  The blank-note and stray-URL rules, on challenge and production too.

  These four exist because the perturbation run found them missing: blanking the
  challenge guard to `true` failed NOTHING, which did not mean the clause was
  redundant — it meant no test had ever put a blank note on anything but rebuild.
  A per-marker rule needs a per-marker assertion or two thirds of it is decoration.
*/
select throws_ok(
  $$insert into public.topics (user_id, title, definition, challenge_at, challenge_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Blank challenge', 'x', '2026-09-01', '   ')$$,
  '23514', null, 'a whitespace-only challenge note is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, production_at, production_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Blank production', 'x', '2026-09-04', '')$$,
  '23514', null, 'an empty production note is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, challenge_url)
    values ('00000000-0000-0000-0000-0000000000e1', 'Stray challenge URL', 'x', 'https://example.com')$$,
  '23514', null, 'a challenge URL with no marker to hang on is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, production_url)
    values ('00000000-0000-0000-0000-0000000000e1', 'Stray production URL', 'x', 'https://example.com')$$,
  '23514', null, 'a production URL with no marker to hang on is rejected'
);

-- ===========================================================================
-- A quiz never carries evidence
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option, rebuild_at, rebuild_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Quiz with a rebuild', 'quiz',
            array['a','b'], 0, '2026-08-28', 'from memory')$$,
  '23514', null, 'a quiz with a rebuild is rejected — there is nothing to rebuild'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option, production_at, production_note)
    values ('00000000-0000-0000-0000-0000000000e1', 'Quiz with production', 'quiz',
            array['a','b'], 0, '2026-09-04', 'used it')$$,
  '23514', null, 'a quiz with production evidence is rejected'
);

select lives_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000e1', 'An ordinary quiz', 'quiz', array['a','b'], 0)$$,
  'an ordinary quiz is unaffected by any of this'
);

-- ===========================================================================
-- The rules survive an UPDATE, not just an INSERT
--
-- Every one of these is reachable through the app: recording, editing and
-- removing a marker are all updates.
-- ===========================================================================
select throws_ok(
  $$update public.topics set rebuild_note = null where title = 'Rebuilt'$$,
  '23514', null, 'removing the note but leaving the date is rejected'
);

select throws_ok(
  $$update public.topics set rebuild_note = '  ' where title = 'Rebuilt'$$,
  '23514', null, 'editing a note down to whitespace is rejected'
);

select throws_ok(
  $$update public.topics set rebuild_at = '2026-08-28', rebuild_note = 'sneaking it in'
    where title = 'An ordinary quiz'$$,
  '23514', null, 'a quiz cannot be given evidence by an update either'
);

select lives_ok(
  $$update public.topics set rebuild_at = null, rebuild_note = null, rebuild_url = null
    where title = 'Rebuilt with a link'$$,
  'removing a marker clears all three of its columns together'
);

-- ===========================================================================
-- Evidence is never an input to the queue
--
-- The failure mode for this whole feature: the moment practice ordering or a
-- count reads an evidence column there are two confidence systems. The source
-- check lives in src/lib/domain/evidence-boundary.test.ts, which fails on the
-- mere mention of a column name; these three assert the outcome in SQL, where the
-- ordering actually runs.
-- ===========================================================================
insert into public.topics (user_id, title, definition, confidence, last_practiced_at)
values
  ('00000000-0000-0000-0000-0000000000e1', 'Queue A', 'x', 'weak', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000e1', 'Queue B', 'x', 'weak', '2026-01-02T00:00:00Z');

select is(
  (select string_agg(title, ',' order by rn)
   from (select title, row_number() over () as rn
         from public.practice_ordered_page(
           array['new','weak','okay','strong']::text[], array['weak']::text[], null,
           null, null, null, null, 100)
         where title like 'Queue %') q),
  'Queue A,Queue B',
  'the queue order before any evidence exists'
);

/*
  Evidence goes on the FIRST topic, then on the SECOND, and the order must not
  move either time.

  The first version of this put evidence only on the topic that already sorted
  second — so a tie-break of `(production_at is not null)` ascending left the order
  identical and the assertion passed while the queue was reading evidence. It was
  the perturbation that caught it, again. Asserting both placements catches a
  tie-break in either direction.
*/
update public.topics set
  rebuild_at = '2026-08-28', rebuild_note = 'built it',
  challenge_at = '2026-09-01', challenge_note = 'solved it',
  production_at = '2026-09-04', production_note = 'shipped it'
where title = 'Queue A';

select is(
  (select string_agg(title, ',' order by rn)
   from (select title, row_number() over () as rn
         from public.practice_ordered_page(
           array['new','weak','okay','strong']::text[], array['weak']::text[], null,
           null, null, null, null, 100)
         where title like 'Queue %') q),
  'Queue A,Queue B',
  'three markers on the FIRST topic move nothing'
);

update public.topics set rebuild_at = null, rebuild_note = null,
  challenge_at = null, challenge_note = null, production_at = null, production_note = null
where title = 'Queue A';

update public.topics set
  production_at = '2026-09-04', production_note = 'shipped it'
where title = 'Queue B';

select is(
  (select string_agg(title, ',' order by rn)
   from (select title, row_number() over () as rn
         from public.practice_ordered_page(
           array['new','weak','okay','strong']::text[], array['weak']::text[], null,
           null, null, null, null, 100)
         where title like 'Queue %') q),
  'Queue A,Queue B',
  'and moving it to the SECOND topic moves nothing either'
);

select is(
  (select (public.weak_counts(
     array['weak','new']::text[], array['okay','strong']::text[], '2020-01-01T00:00:00Z'
   ))->>'total'),
  (select count(*)::text from public.topics where confidence in ('weak','new')),
  'the weak count counts confidence and has never heard of evidence'
);

select * from finish();
rollback;
