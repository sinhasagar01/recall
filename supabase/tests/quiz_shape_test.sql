-- The constraints are the feature.
--
-- One table, two shapes. A quiz needs 2+ options and a correct_option that indexes
-- into them; a topic needs a definition and neither of those. Enforced in the
-- database rather than only in the form, because the form is one of several ways a
-- row can arrive and the only one a person can see.
--
-- Written and run red before the migration exists.

begin;
select plan(29);

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

-- A row that existed before the migration, so the backfill has something to catch.
select tests_create_user('00000000-0000-0000-0000-0000000000c1', 'shapes@recall.test');
insert into public.topics (user_id, title, definition)
  values ('00000000-0000-0000-0000-0000000000c1', 'Pre-existing topic', 'Saved before quizzes existed.');

select tests_login_as('00000000-0000-0000-0000-0000000000c1');

-- ===========================================================================
-- The columns
-- ===========================================================================
select has_column('public'::name, 'topics'::name, 'kind'::name, 'topics has a kind');
select has_column('public'::name, 'topics'::name, 'options'::name, 'topics has options');
select has_column('public'::name, 'topics'::name, 'correct_option'::name, 'topics has correct_option');

select col_not_null('public'::name, 'topics'::name, 'kind'::name, 'kind is not null');
select col_is_null('public'::name, 'topics'::name, 'definition'::name,
  'definition is nullable now — a quiz has none, and a CHECK holds the guarantee for topics');

-- ===========================================================================
-- Backfill: everything that existed is a topic
-- ===========================================================================
select is(
  (select count(*)::int from public.topics where kind <> 'topic'),
  0,
  'every pre-existing row is kind=topic'
);

select is(
  (select kind from public.topics where title = 'Pre-existing topic'),
  'topic',
  'a row inserted without a kind takes the default'
);

-- ===========================================================================
-- kind is closed
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, definition, kind)
    values ('00000000-0000-0000-0000-0000000000c1', 'Bad kind', 'x', 'flashcard')$$,
  '23514',
  null,
  'kind accepts only topic and quiz'
);

-- ===========================================================================
-- A quiz: what it must have
-- ===========================================================================
select lives_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option, mental_model)
    values ('00000000-0000-0000-0000-0000000000c1', 'A valid quiz?', 'quiz',
            array['yes','no'], 0, 'Because it has two options and a valid index.')$$,
  'a quiz with 2 options and a valid index is accepted'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'No options', 'quiz', 0)$$,
  '23514', null, 'a quiz without options is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'One option', 'quiz', array['only'], 0)$$,
  '23514', null, 'a quiz with one option is rejected — a single choice is not a question'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Empty options', 'quiz', array[]::text[], 0)$$,
  '23514', null, 'a quiz with an empty options array is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options)
    values ('00000000-0000-0000-0000-0000000000c1', 'No answer', 'quiz', array['a','b'])$$,
  '23514', null, 'a quiz without a correct_option is rejected'
);

-- ===========================================================================
-- correct_option must actually index into options
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Index too high', 'quiz', array['a','b'], 2)$$,
  '23514', null, 'correct_option past the end is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Index negative', 'quiz', array['a','b'], -1)$$,
  '23514', null, 'a negative correct_option is rejected'
);

select lives_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Last index', 'quiz', array['a','b','c'], 2)$$,
  'the last valid index is accepted — the boundary belongs to the valid side'
);

-- ===========================================================================
-- A quiz: what it must not have
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, definition, kind, options, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Has a definition', 'a definition', 'quiz',
            array['a','b'], 0)$$,
  '23514', null, 'a quiz with a definition is rejected — its question is its title'
);

select throws_ok(
  $$insert into public.topics (user_id, title, kind, options, correct_option, mental_model_image_path)
    values ('00000000-0000-0000-0000-0000000000c1', 'Has an image', 'quiz', array['a','b'], 0,
            '00000000-0000-0000-0000-0000000000c1/x/diagram.png')$$,
  '23514', null, 'a quiz with an image is rejected — a quiz that needs a diagram is a topic'
);

-- ===========================================================================
-- A topic: the coupling in the other direction
-- ===========================================================================
select throws_ok(
  $$insert into public.topics (user_id, title, kind)
    values ('00000000-0000-0000-0000-0000000000c1', 'No definition', 'topic')$$,
  '23514', null, 'a topic without a definition is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, kind, options)
    values ('00000000-0000-0000-0000-0000000000c1', 'Topic with options', 'x', 'topic', array['a','b'])$$,
  '23514', null, 'a topic carrying options is rejected'
);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, kind, correct_option)
    values ('00000000-0000-0000-0000-0000000000c1', 'Topic with an answer', 'x', 'topic', 0)$$,
  '23514', null, 'a topic carrying a correct_option is rejected'
);

select lives_ok(
  $$insert into public.topics (user_id, title, definition)
    values ('00000000-0000-0000-0000-0000000000c1', 'An ordinary topic', 'Still works.')$$,
  'an ordinary topic is unaffected by any of this'
);

-- ===========================================================================
-- The coupling survives an UPDATE, not just an INSERT
-- ===========================================================================
select throws_ok(
  $$update public.topics set kind = 'quiz' where title = 'An ordinary topic'$$,
  '23514', null, 'a topic cannot be turned into a quiz without gaining options'
);

select throws_ok(
  $$update public.topics set options = array['a'] where title = 'A valid quiz?'$$,
  '23514', null, 'a quiz cannot be edited down to one option'
);

select throws_ok(
  $$update public.topics set correct_option = 5 where title = 'A valid quiz?'$$,
  '23514', null, 'a quiz cannot be edited to an out-of-range answer'
);

select lives_ok(
  $$update public.topics set options = array['yes','no','maybe'], correct_option = 2
    where title = 'A valid quiz?'$$,
  'a quiz can gain an option and move its answer in one statement'
);

-- ===========================================================================
-- The shared reads do not filter quizzes out
--
-- "Confidence, the weak page and practice ordering treat both shapes
-- identically — a weak quiz and a weak topic sit in the same list." That is a
-- claim about a query, and it is asserted here rather than by looking at the
-- weak page, which is ordered and paged at 60 rows: on any real library a quiz
-- can be genuinely present and simply below the fold, so an on-screen check
-- would prove nothing in one direction and be flaky in the other.
-- ===========================================================================
update public.topics set confidence = 'weak' where title = 'A valid quiz?';
update public.topics set confidence = 'weak' where title = 'An ordinary topic';

select is(
  (select count(*)::int from practice_ordered_page(
     p_bucket_order := array['new','weak','okay','strong'],
     p_confidences := array['weak','new'],
     p_limit := 100)
   where title = 'A valid quiz?'),
  1,
  'a weak quiz is in the weak query, unfiltered'
);

select is(
  (select count(*)::int from practice_ordered_page(
     p_bucket_order := array['new','weak','okay','strong'],
     p_confidences := array['weak','new'],
     p_limit := 100)
   where title in ('A valid quiz?', 'An ordinary topic')),
  2,
  'a weak quiz and a weak topic come back from the same query, in one list'
);

-- And the separation exists: ?scope=quiz is a kind filter over the same query.
select is(
  (select count(*)::int from practice_ordered_page(
     p_bucket_order := array['new','weak','okay','strong'],
     p_kinds := array['quiz'],
     p_limit := 100)
   where kind <> 'quiz'),
  0,
  'p_kinds narrows to quizzes without changing anything else'
);

select * from finish();
rollback;
