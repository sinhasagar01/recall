-- Extraction. Two columns and one queue parameter.
--
-- What this file exists to prove: coverage can only ever be an ARRAY, so a merge
-- cannot append to an object; `extracted` is a flag and nothing more, invisible
-- to the queue and to what counts as weak; and `p_ids` restricts a session to a
-- chosen set WITHOUT the queue knowing what a source is.
--
-- Written and run RED before the migration exists.

begin;
select plan(23);

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

-- ===========================================================================
-- The two columns
-- ===========================================================================
select col_type_is('public'::name, 'sources'::name, 'coverage'::name, 'jsonb',
  'coverage is jsonb — the record of a decision, not a model response');
select col_not_null('public'::name, 'sources'::name, 'coverage'::name,
  'a source always has a coverage list, even when it is empty');
-- Read from information_schema rather than col_default_is, which casts the
-- expected value to the column type and cannot express a jsonb default.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'sources' and column_name = 'coverage'),
  '''[]''::jsonb',
  'a source that has never been extracted from has an empty list, not null'
);

select col_type_is('public'::name, 'topics'::name, 'extracted'::name, 'boolean',
  'extracted is a flag');
select col_not_null('public'::name, 'topics'::name, 'extracted'::name,
  'every topic knows which it is');
select col_default_is('public'::name, 'topics'::name, 'extracted'::name, 'false',
  'written by hand is the default — the app existed before extraction did');

-- The checklist is gone, and its column with it.
select hasnt_column('public'::name, 'sources'::name, 'caveat_noted'::name,
  'the one manual extraction is gone with the checklist it belonged to');

-- ===========================================================================
-- Coverage is an array, and only an array
-- ===========================================================================
-- Both users up front. `tests_create_user` writes to auth.users, which the
-- `authenticated` role cannot do — so creating the second one after the first
-- login fails with "permission denied for table users" rather than anything
-- to do with the feature.
select tests_create_user('00000000-0000-0000-0000-0000000000a1'::uuid, 'a@extract.test');
select tests_create_user('00000000-0000-0000-0000-0000000000a2'::uuid, 'b@extract.test');
select tests_login_as('00000000-0000-0000-0000-0000000000a1'::uuid);

insert into public.sources (id, title)
values ('00000000-0000-0000-0000-0000000000f1'::uuid, 'A course');

select is(
  (select jsonb_typeof(coverage) from public.sources
    where id = '00000000-0000-0000-0000-0000000000f1'::uuid),
  'array',
  'it starts as an array'
);

/*
  The one guarantee worth buying at this level. The database cannot see the shape
  of a coverage entry — `parseCoverage` validates that on read — but it CAN
  refuse a value that is not a list, and that is what stops `mergeCoverage` ever
  appending to an object.
*/
select throws_ok(
  $$update public.sources set coverage = '{"not": "a list"}'::jsonb
      where id = '00000000-0000-0000-0000-0000000000f1'::uuid$$,
  '23514',
  null,
  'an object is refused — a merge can never append to one'
);

select throws_ok(
  $$update public.sources set coverage = '"a string"'::jsonb
      where id = '00000000-0000-0000-0000-0000000000f1'::uuid$$,
  '23514',
  null,
  'a scalar is refused too'
);

select lives_ok(
  $$update public.sources set coverage = '[{"title": "Closures", "status": "kept"}]'::jsonb
      where id = '00000000-0000-0000-0000-0000000000f1'::uuid$$,
  'a list of entries is what it is for'
);

-- ===========================================================================
-- `extracted` is a flag, and the queue cannot see it
-- ===========================================================================
insert into public.topics (id, title, definition, kind, confidence, extracted, source_id)
values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'Extracted weak', 'From a video.', 'topic', 'weak', true,
    '00000000-0000-0000-0000-0000000000f1'::uuid),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'Written weak', 'By hand.', 'topic', 'weak', false, null);

/*
  The whole point of the flag being only a filter. If extraction changed what the
  app asks you to practise, "nothing is graded by a model" would be false in the
  one place it matters most.
*/
select is(
  (select count(*)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null, null)
   where id in ('00000000-0000-0000-0000-0000000000b1'::uuid,
                '00000000-0000-0000-0000-0000000000b2'::uuid)),
  2,
  'both reach the queue — extraction is not a reason to practise something less'
);

select is(
  (select count(distinct extracted)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null, null)
   where id in ('00000000-0000-0000-0000-0000000000b1'::uuid,
                '00000000-0000-0000-0000-0000000000b2'::uuid)),
  2,
  'the queue returns the flag but does not order by it'
);

-- ===========================================================================
-- `p_ids` restricts to a chosen set, and knows nothing about sources
-- ===========================================================================
select is(
  (select count(*)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null,
    ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid])),
  1,
  'a set of one id is a session of one'
);

select is(
  (select id from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null,
    ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid])),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'and it is the one that was asked for'
);

select is(
  (select count(*)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null, null)
   where id in ('00000000-0000-0000-0000-0000000000b1'::uuid,
                '00000000-0000-0000-0000-0000000000b2'::uuid)),
  2,
  'null means no restriction, so every other entry point is unchanged'
);

select is(
  (select count(*)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null,
    ARRAY[]::uuid[])),
  0,
  'an empty set is a session of nothing, not a session of everything'
);

/*
  The parameter is uuid[] and nothing else. If it were ever given a source id to
  resolve, this function would have to know what a source is — and
  sources-boundary.test.ts forbids exactly that, in this file and in the two
  modules that call it.
*/
select is(
  (select count(*)::int from information_schema.parameters
   where specific_schema = 'public'
     and specific_name = (select specific_name from information_schema.routines
                          where routine_schema = 'public'
                            and routine_name = 'practice_ordered_page')
     and parameter_name = 'p_ids'
     and data_type = 'ARRAY'),
  1,
  'the queue takes ids, never a source'
);

-- ===========================================================================
-- Another user's coverage and flags are invisible, as ever
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000a2'::uuid);

select is(
  (select count(*)::int from public.sources
    where id = '00000000-0000-0000-0000-0000000000f1'::uuid),
  0,
  'a coverage list belongs to whoever made the decisions in it'
);

select is(
  (select count(*)::int from public.practice_ordered_page(
    ARRAY['new','weak','okay','strong'], null, 'seed', null, null, null, null, 60, null, null,
    ARRAY['00000000-0000-0000-0000-0000000000b1'::uuid])),
  0,
  'and p_ids is not a way around RLS — asking for another user''s id returns nothing'
);

-- ===========================================================================
-- Grants. RLS and GRANT are separate gates; only the migrations answer this one.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.sources', 'UPDATE'),
  'authenticated may write coverage back');
select ok(has_table_privilege('authenticated', 'public.topics', 'INSERT'),
  'authenticated may save what it kept');
select ok(has_function_privilege('authenticated',
  'public.practice_ordered_page(text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz, text[], uuid[])',
  'EXECUTE'),
  'the re-created function was re-granted — dropping one drops its grants with it');

select * from finish();
rollback;
