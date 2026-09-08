-- Interview rounds. One row per COMPLETED round, numbers only.
--
-- Three things this file exists to prove.
--
-- **No model prose is stored.** The scorecard shows a summary, a sentence per
-- dimension and a note per question, all model-written and none of it written
-- down. `columns_are` is what makes that a property of the schema rather than a
-- promise about a code path — there is no column to put prose in.
--
-- **A round that was abandoned left nothing.** The row is inserted once, at the
-- end, with the scorecard. There is no in-flight row, so there is nothing to
-- orphan; the conversation lives in the browser and dies with the tab.
--
-- **The scores are bounded.** 0–100 is the scale the whole mode is built on, and
-- a model returning 137 must fail at the database rather than render as a bar
-- wider than its track.
--
-- Written and run RED before the migration exists.

begin;
select plan(32);

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

select tests_create_user('00000000-0000-0000-0000-0000000000e1'::uuid, 'owner@interview.test');
select tests_create_user('00000000-0000-0000-0000-0000000000e2'::uuid, 'other@interview.test');

-- ===========================================================================
-- The shape
-- ===========================================================================
select has_table('public'::name, 'interview_rounds'::name, 'there is an interview_rounds table');

/*
  The exact column set, and this is the assertion that holds "no model prose is
  persisted". Every column here is a number, an enum-ish text, a timestamp or an
  array of ids. There is nowhere to put a sentence, so nobody can later decide to
  keep "just the summary" without this failing.

  `hasnt_column` on the three most likely additions, named rather than implied:
  the summary, the transcript, and the per-question notes.
*/
select columns_are('public'::name, 'interview_rounds'::name, ARRAY[
  'id', 'user_id',
  -- What was asked, and by whom.
  'round_type', 'minutes', 'level',
  -- Counted in code, never judged by a model.
  'asked', 'answered', 'follow_ups_offered', 'follow_ups_held',
  'questions_asked', 'hints_used',
  -- The clock is advisory: it ends nothing, and its teeth are these two columns.
  'elapsed_seconds', 'over_by_seconds',
  -- The model's judgement of what was said. Four dimensions, 0–100, plus the roll-up.
  'recall', 'depth', 'precision', 'enquiry', 'overall',
  -- Which topics the round drew on, so the scorecard can offer them.
  'topic_ids',
  'created_at'
], 'interview_rounds has exactly these columns — and nowhere to put prose');

/*
  ── PERMANENT. These three are the rule, not a phase. ──────────────────────
  No model prose is stored, ever. If a later arc wants to keep "just the
  summary", this is the line it has to argue with, and the argument is the one
  in the migration header: storing it builds the second library this product has
  refused for seven arcs.
*/
select hasnt_column('public'::name, 'interview_rounds'::name, 'summary'::name,
  'PERMANENT: the round summary is model prose and is not stored');
select hasnt_column('public'::name, 'interview_rounds'::name, 'transcript'::name,
  'PERMANENT: the conversation is discarded, never persisted');
select hasnt_column('public'::name, 'interview_rounds'::name, 'notes'::name,
  'PERMANENT: per-question notes are prose too');

/*
  ── SESSION ONE ONLY. Session two deletes this line. ──────────────────────
  A different kind of assertion from the three above, and they sit together so
  the difference is visible rather than inferred.

  DSA is not built in session one, so the column its "your code is kept" implies
  must not exist yet — nothing stubbed. Session two adds the DSA round AND the
  `code` column, and **deleting this assertion is part of that work**, not a
  regression in it.

  Written this way because an unqualified `hasnt_column` reads as a permanent
  rule, and the next person then argues with the plan instead of deleting the
  line.
*/
select hasnt_column('public'::name, 'interview_rounds'::name, 'code'::name,
  'SESSION ONE ONLY: DSA is not built yet, so its column does not exist yet — session two removes this assertion');

select col_not_null('public'::name, 'interview_rounds'::name, 'round_type'::name,
  'a round is always of some type');
select col_not_null('public'::name, 'interview_rounds'::name, 'overall'::name,
  'a stored round always has a score — an unscored round is not saved at all');
select col_type_is('public'::name, 'interview_rounds'::name, 'topic_ids'::name, 'uuid[]',
  'the topics it drew on, by id');

-- ===========================================================================
-- Ownership is a default, never a client-supplied value
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000e1'::uuid);

select lives_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('javascript', 45, 'staff', 8, 8, 14, 9, 2, 1, 2900, 200,
            86, 58, 79, 80, 74, '{}'::uuid[])$$,
  'a completed round is saved in one insert'
);

select is(
  (select user_id from public.interview_rounds where round_type = 'javascript'),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'user_id comes from the column default, never from the client'
);

select throws_ok(
  $$insert into public.interview_rounds
      (user_id, round_type, minutes, level, asked, answered, follow_ups_offered,
       follow_ups_held, questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('00000000-0000-0000-0000-0000000000e2'::uuid, 'react', 20, 'staff',
            4, 4, 6, 6, 0, 0, 1200, 0, 90, 90, 90, 90, 90, '{}'::uuid[])$$,
  '42501', null,
  'a forged owner is refused by the insert policy''s with-check'
);

-- ===========================================================================
-- The scores are bounded, because the scale is what the mode is built on
-- ===========================================================================
select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 4, 4, 4, 0, 0, 1200, 0,
            137, 50, 50, 50, 50, '{}'::uuid[])$$,
  '23514', null,
  'a dimension above 100 is refused — a bar wider than its track is a data error'
);

select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 4, 4, 4, 0, 0, 1200, 0,
            50, -1, 50, 50, 50, '{}'::uuid[])$$,
  '23514', null,
  'and below zero'
);

select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 4, 4, 4, 0, 0, 1200, 0,
            50, 50, 50, 50, 101, '{}'::uuid[])$$,
  '23514', null,
  'the roll-up is on the same scale as the dimensions'
);

/*
  Held can never exceed offered.

  This is the constraint the REFERENCE would have failed: its hero claimed 11 of
  14 follow-ups held over a question list whose ceiling was 9. These figures are
  counted in code, so the database is where an impossible pair stops being
  writable — see TASKS.md, the seventh reference shape.
*/
select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 4, 3, 11, 0, 0, 1200, 0,
            50, 50, 50, 50, 50, '{}'::uuid[])$$,
  '23514', null,
  'more follow-ups held than were offered is not a low score, it is impossible'
);

select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 8, 4, 4, 0, 0, 1200, 0,
            50, 50, 50, 50, 50, '{}'::uuid[])$$,
  '23514', null,
  'and answering more questions than were asked'
);

select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('react', 20, 'staff', 4, 4, 4, 4, 0, 0, -5, 0,
            50, 50, 50, 50, 50, '{}'::uuid[])$$,
  '23514', null,
  'a round cannot have taken negative time'
);

select lives_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('behavioural', 20, 'friendly', 4, 3, 5, 2, 1, 3, 1500, 0,
            0, 0, 0, 0, 0, '{}'::uuid[])$$,
  'a round you did badly at is still a valid round — zero is a score, not an error'
);

-- ===========================================================================
-- Another user's rounds are invisible, in all four directions
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000e2'::uuid);

select is(
  (select count(*)::int from public.interview_rounds),
  0,
  'a round belongs to whoever sat it'
);

select is(
  (select tests_affected($$update public.interview_rounds set overall = 100$$)),
  0,
  'and cannot be re-scored by anyone else — a using failure affects zero rows'
);

select is(
  (select tests_affected($$delete from public.interview_rounds$$)),
  0,
  'nor deleted'
);

-- ===========================================================================
-- Signed out, nothing at all
-- ===========================================================================
select tests_login_as_anon();

select is(
  (select count(*)::int from public.interview_rounds),
  0,
  'anon selects nothing'
);

select throws_ok(
  $$insert into public.interview_rounds
      (round_type, minutes, level, asked, answered, follow_ups_offered, follow_ups_held,
       questions_asked, hints_used, elapsed_seconds, over_by_seconds,
       recall, depth, precision, enquiry, overall, topic_ids)
    values ('javascript', 45, 'staff', 1, 1, 1, 1, 0, 0, 60, 0,
            50, 50, 50, 50, 50, '{}'::uuid[])$$,
  '42501', null,
  'anon cannot insert a round'
);

select is(
  (select tests_affected($$update public.interview_rounds set overall = 1$$)),
  0,
  'anon updates nothing'
);

select is(
  (select tests_affected($$delete from public.interview_rounds$$)),
  0,
  'anon deletes nothing'
);

-- ===========================================================================
-- Table privileges. RLS and GRANT are two independent gates and only one of
-- them fails loudly — see sources_test.sql for the outage that taught this.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.interview_rounds', 'SELECT'),
  'authenticated may SELECT interview_rounds');
select ok(has_table_privilege('authenticated', 'public.interview_rounds', 'INSERT'),
  'authenticated may INSERT interview_rounds');
select ok(has_table_privilege('authenticated', 'public.interview_rounds', 'UPDATE'),
  'authenticated may UPDATE interview_rounds');
select ok(has_table_privilege('authenticated', 'public.interview_rounds', 'DELETE'),
  'authenticated may DELETE interview_rounds');

-- ===========================================================================
-- A round never reaches the practice queue
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000e1'::uuid);

/*
  The interview reads topics; it never writes one, and it is not a practisable
  thing itself. The boundary test forbids the table's name in the queue modules;
  this is the database half — a round has no confidence, so there is nothing for
  the queue to order it by even if it could see it.
*/
select hasnt_column('public'::name, 'interview_rounds'::name, 'confidence'::name,
  'a round has no confidence — the score is about the round, never about what you know');
select hasnt_column('public'::name, 'interview_rounds'::name, 'last_practiced_at'::name,
  'and it is never practised');

select * from finish();
rollback;
