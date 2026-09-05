-- Properties of a seeded practice session.
--
-- The unseeded ordering is deterministic and is asserted id-for-id against
-- orderForPractice in library_parity_test.sql. A seeded session cannot be: the
-- tie-break is md5(seed || id) rather than seededShuffle's Fisher-Yates, so the
-- ten topics differ from what the browser would have picked.
--
-- That is not a weakened rule. `Shuffle` has been an injected parameter since
-- phase 2 — selectPracticeSession(topics, { shuffle }) — so the domain specifies
-- THAT ties are broken, never WHICH permutation. noShuffle and seededShuffle are
-- already two implementations of it and this is a third.
--
-- But it does mean these properties are the only thing holding the rule, with no
-- id-for-id backstop underneath. So they are exhaustive, and each one has been
-- shown to fail against a deliberately perturbed ordering before being accepted.

begin;
select plan(9);

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

-- PRACTICE_SESSION_SIZE, and the bucket order, both defined in
-- src/lib/domain/practice-selection.ts. The application passes them in; this test
-- states them so the properties can be checked in isolation.
create function tests_session_size() returns int language sql immutable as $fn$ select 10 $fn$;
create function tests_buckets() returns text[] language sql immutable as $fn$
  select array['new','weak','okay','strong']::text[]
$fn$;

/*
  A session for a given seed, as an ordered id list.
*/
create function tests_session(seed text, lim int default 10) returns text
language sql as $fn$
  with page as (
    select id, row_number() over () as rn
    from public.practice_ordered_page(tests_buckets(), null, seed, null, null, null, null, lim)
  )
  select coalesce(string_agg(id::text, ',' order by rn), '') from page
$fn$;

create function tests_tie_selection_counts() returns table(title text, n int)
language sql as $fn$
  select t.title, count(*)::int
  from generate_series(1, 40) s
  cross join lateral (
    select id from public.practice_ordered_page(
      tests_buckets(), null, 'seed-' || s, null, null, null, null, tests_session_size())
  ) picked
  join public.topics t on t.id = picked.id
  where t.confidence = 'new'
  group by t.title
$fn$;

select tests_create_user('00000000-0000-0000-0000-0000000000a1', 'practice@recall.test');
select tests_login_as('00000000-0000-0000-0000-0000000000a1');

/*
  The fixture.

  40 `new` topics, none ever practised — ONE tie group, which is the shape that
  motivated issue #12: confidence starts at `new`, so a freshly imported library is
  entirely one tie. Then practised topics in later buckets with distinct stamps, and
  one `weak` topic never practised, which is the case that separates
  "null sorts first" from "null is a tie".
*/
insert into public.topics (user_id, title, definition, confidence, last_practiced_at)
select '00000000-0000-0000-0000-0000000000a1', 'Tied ' || g, 'One big tie group.', 'new', null
from generate_series(1, 40) g;

/*
  Twelve weak topics with DISTINCT practice stamps, not three.

  Three was not enough: dropping staleness from the ordering left them to be sorted
  by the tie-break, and with three rows a wrong order has a decent chance of
  matching a right one — the perturbation ran green. Twelve distinct stamps makes
  an accidental pass vanishingly unlikely, which is the difference between a
  property that holds and one that merely has not been contradicted.
*/
insert into public.topics (user_id, title, definition, confidence, last_practiced_at)
select '00000000-0000-0000-0000-0000000000a1', 'Weak ' || g, 'Weak, practised.', 'weak',
       ('2020-01-01T00:00:00Z'::timestamptz + (g || ' days')::interval)
from generate_series(1, 12) g;

insert into public.topics (user_id, title, definition, confidence, last_practiced_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Weak never', 'Weak, never practised.', 'weak', null),
  ('00000000-0000-0000-0000-0000000000a1', 'Okay one', 'Okay.', 'okay', '2021-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'Strong one', 'Strong.', 'strong', '2022-01-01T00:00:00Z');

-- ===========================================================================
-- 1. Bucket order is respected: never a lower bucket after a higher one.
-- ===========================================================================
select is(
  (
    with ordered as (
      select bucket, row_number() over () as rn
      from public.practice_ordered_page(tests_buckets(), null, 'seed-a', null, null, null, null, 1000)
    )
    select count(*)::int from ordered a join ordered b on b.rn = a.rn + 1 where b.bucket < a.bucket
  ),
  0,
  'bucket order is respected across the whole result'
);

-- ===========================================================================
-- 2. Staleness ascends within a bucket.
-- ===========================================================================
select is(
  (
    with ordered as (
      select bucket, staleness, row_number() over () as rn
      from public.practice_ordered_page(tests_buckets(), null, 'seed-a', null, null, null, null, 1000)
    )
    select count(*)::int from ordered a join ordered b on b.rn = a.rn + 1
    where b.bucket = a.bucket and b.staleness < a.staleness
  ),
  0,
  'staleness ascends within each bucket'
);

-- ===========================================================================
-- 3. Never practised sorts FIRST within its bucket — not tied with a practised
--    one. "Weak never" must precede both practised weak topics.
-- ===========================================================================
select ok(
  (
    with ordered as (
      select title, row_number() over () as rn
      from public.practice_ordered_page(tests_buckets(), null, 'seed-a', null, null, null, null, 1000)
    )
    select (select rn from ordered where title = 'Weak never')
         < (select min(rn) from ordered where title like 'Weak %' and title <> 'Weak never')
  ),
  'a topic never practised is the stalest in its bucket, not a tie'
);

-- ===========================================================================
-- 4. The same seed yields the same session.
-- ===========================================================================
select is(tests_session('seed-a'), tests_session('seed-a'), 'the same seed yields the same session');

-- ===========================================================================
-- 5. A different seed yields a different session.
-- ===========================================================================
select isnt(tests_session('seed-a'), tests_session('seed-b'), 'a different seed yields a different session');

-- ===========================================================================
-- 6. Uniformity: over 40 seeds the tie group's 40 members are selected about
--    equally. Expected 10 selections each (40 seeds x 10 picks / 40 members).
--    An ordering that ignored the seed would give 40 to ten members and 0 to the
--    other thirty, which is what the bounds below are set to catch.
-- ===========================================================================

select ok(
  (select count(*) from tests_tie_selection_counts()) = 40,
  'over 40 seeds every member of the tie group is selected at least once'
);

select ok(
  (select max(n) from tests_tie_selection_counts()) <= 25,
  'no member of the tie group dominates the selection'
);

-- ===========================================================================
-- 7. The session is exactly min(total, PRACTICE_SESSION_SIZE).
-- ===========================================================================
select is(
  (select count(*)::int from public.practice_ordered_page(
     tests_buckets(), null, 'seed-a', null, null, null, null, tests_session_size())),
  tests_session_size(),
  'a session is PRACTICE_SESSION_SIZE rows when there are more than that'
);

select is(
  (select count(*)::int from public.practice_ordered_page(
     tests_buckets(), array['strong']::text[], 'seed-a', null, null, null, null, tests_session_size())),
  1,
  'a session is the whole set when there are fewer than PRACTICE_SESSION_SIZE'
);

select * from finish();
rollback;
