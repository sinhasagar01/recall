-- Evidence on a topic.
--
-- The learning plan calls a concept known only when you can explain it, implement
-- a variant, and use it in a design decision. `confidence` measures the first and
-- calls it "strong". These three markers record the rest.
--
-- ── Why nine scalar columns and not a jsonb document ────────────────────────
-- `TopicBoundaryIsSound` in src/lib/data/topic-mapping.ts asserts the generated
-- row and the hand-written domain Topic are the same shape, and a new column
-- fails the build there on purpose. `supabase gen types` renders jsonb as `Json`
-- — a recursive, any-shaped union — so a jsonb column would make that assertion
-- VACUOUS for evidence: every object satisfies Json. Scalars keep the guard real.
--
-- And the coupling below is provable clause by clause. A nested-jsonb CHECK
-- (`?`, `->`, `jsonb_typeof`) is exactly where this schema's CHECK-passes-on-NULL
-- family lives, and it has been bitten three times.
--
-- The quiz phase set the precedent: three typed columns plus a shape CHECK rather
-- than a second table or a blob.
--
-- `date`, not `timestamptz`. The input is type="date" and the display is "Aug 28".
-- A date has no timezone question, and inventing one would be the same mistake as
-- computing "today" in UTC.

alter table public.topics
  add column rebuild_at date,
  add column rebuild_note text,
  add column rebuild_url text,
  add column challenge_at date,
  add column challenge_note text,
  add column challenge_url text,
  add column production_at date,
  add column production_note text,
  add column production_url text;

/*
  A SIBLING of topics_shape_is_consistent, not an edit to it.

  That constraint governs topic/quiz CONTENT — definition, options, correct index,
  image. This one governs evidence. Two constraints mean a violation names which
  rule broke rather than one CASE reporting everything; and it avoids dropping and
  recreating a constraint that already carries the hard-won
  `coalesce(array_length(options, 1), 0)` fix, where a rewrite risks reintroducing
  precisely the bug ARCHITECTURE.md documents.

  ── Which clauses can evaluate to NULL ──────────────────────────────────────
    (x_at is null) = (x_note is null)      both sides are booleans. Never NULL.
    (x_url is null or x_at is not null)    both operands are booleans. Never NULL.
    (x_note is null or length(...) > 0)    the RIGHT operand IS NULL when the note
                                           is NULL.
    (kind = 'topic' or ...)                kind is NOT NULL. Never NULL.

  ── The `x_note is null or` disjunct is REDUNDANT, and the perturbation proved it
  Removing it fails nothing. That was not the prediction written here first, and
  the prediction was wrong.

  Why it cannot bite: in three-valued logic `NULL and false = false`, so a NULL
  from `length(btrim(NULL)) > 0` can only turn a would-be-TRUE into NULL — and a
  CHECK passes on NULL exactly as it passes on TRUE. The rows where the note is
  NULL *and every other clause holds* are precisely the rows with no evidence for
  that marker, which must be accepted anyway. The clause that actually rejects a
  date-without-a-note is the coupling on the line above.

  It stays, labelled, for one reason: it makes this line independently NULL-safe
  instead of borrowing its safety from the clause beside it. If the coupling were
  ever loosened, this becomes load-bearing. Kept as belt-and-braces, not claimed
  as a guard — the difference matters, because the previous three bugs in this
  schema were all clauses ASSUMED to bite that did not.

  Everything else here was perturbed and does bite. See TASKS.md for the table.
*/
alter table public.topics add constraint topics_evidence_is_consistent check (
  -- Rebuild
  (rebuild_at is null) = (rebuild_note is null)
  and (rebuild_url is null or rebuild_at is not null)
  and (rebuild_note is null or length(btrim(rebuild_note)) > 0)

  -- Challenge
  and (challenge_at is null) = (challenge_note is null)
  and (challenge_url is null or challenge_at is not null)
  and (challenge_note is null or length(btrim(challenge_note)) > 0)

  -- Production
  and (production_at is null) = (production_note is null)
  and (production_url is null or production_at is not null)
  and (production_note is null or length(btrim(production_note)) > 0)

  -- A quiz is a retrieval device, not a concept: there is nothing to rebuild or
  -- apply, so it carries none of the nine.
  and (
    kind = 'topic'
    or (
      rebuild_at is null and rebuild_note is null and rebuild_url is null
      and challenge_at is null and challenge_note is null and challenge_url is null
      and production_at is null and production_note is null and production_url is null
    )
  )
);

/*
  Evidence is deliberately NOT part of search_text.

  Mechanically it would need a new topic_search_text overload and an
  ALTER COLUMN ... SET EXPRESSION, the manoeuvre the quiz phase performed for
  options. Substantively it would make search worse: an evidence note names the
  ARTEFACT, not the concept, so "Search cancellation in the capstone" would make
  every capstone-related topic match "capstone". Search finds a concept by what it
  is; evidence records what you did with it.

  Evidence is also never read by practice selection, practice ordering, the weak
  page or any count. No function in this file or any other is changed to see it,
  and src/lib/domain/evidence-boundary.test.ts fails on the mere mention of one of
  these column names in those modules.
*/
