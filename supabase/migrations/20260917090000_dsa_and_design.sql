-- Arc 7, session three — DSA and System design.
--
-- Two round types join the five, and one column joins the numbers.
--
-- ── Why there is only one column here ───────────────────────────────────────
-- A DSA round and a design round differ from a concept round in what happens in
-- the room, not in what is worth keeping afterwards. The scorecard's rows become
-- problems or phases, and that reaches nothing: per-question detail is model
-- prose, rendered once from the response that produced the numbers and never
-- written down. `interview_test.sql` asserts there is no column to put it in.
--
-- So the only schema question this arc actually had was what happens to the code.

alter table public.interview_rounds
  add column code text[] not null default '{}';

comment on column public.interview_rounds.code is
  'One solution per DSA problem, in the order they were asked. Empty string where nothing was written. Empty array for every other round type.';

/*
  ── Why text[] and not jsonb ────────────────────────────────────────────────
  The recorded jsonb rule is not "avoid jsonb". It is that a jsonb column
  accepts any key, so the mismatch between the stored shape and the read shape
  has exactly one place it can be caught — which means a named stored type, an
  explicit serialiser and a round-trip test. A column the database cannot see
  the inside of is one the application has to see the inside of twice.

  An array is a shape the database CAN see the inside of. It has an element
  type, `array_length` works on it, and the CHECKs below can bound it. So it
  needs no serialiser and cannot silently store a camelCase key nobody reads.

  The tempting jsonb shape is `[{ statement, code }]`, so a solution read back
  later says what it solves. That is the shape this table already refuses: a
  problem statement is GENERATED — it is the model's prose, like the summary and
  the per-question notes that have no columns either. The code is yours. That is
  the line this table has drawn since session one, and `code` is simply the
  first column on the other side of it.

  The cost, stated rather than discovered: a stored solution has no stored
  problem, so it is self-describing only to the extent that code is. Accepted.
*/

/*
  ── And nothing reads it in this arc ────────────────────────────────────────
  The scorecard renders the code it collapses from client state, because the
  round that produced it is still open in the browser. There is no past-round
  detail surface and none is built here.

  It is written because the setup card promises "your code is kept", and a
  promise that survives only until the tab closes is not one. Named here so the
  next person meets the fact rather than discovering it.
*/

alter table public.interview_rounds
  drop constraint interview_rounds_type_is_known;

alter table public.interview_rounds
  add constraint interview_rounds_type_is_known
    check (round_type in ('javascript', 'react', 'typescript', 'dsa', 'design',
                          'behavioural', 'mixed'));

/*
  Code belongs to DSA and to nothing else.

  Not tidiness. A concept round carrying code would mean the editor rendered
  where it should not have, and the scorecard would offer to expand a solution
  to a question that never asked for one.
*/
alter table public.interview_rounds
  add constraint interview_rounds_code_is_dsa_only
    check (round_type = 'dsa' or code = '{}');

/*
  The same shape as `counts_reconcile`: a pair that cannot both be free.

  More solutions than problems asked is not a bad round, it is an impossible one.

  ── The `coalesce` is belt-and-braces, and the prediction attached to it was
  wrong ─────────────────────────────────────────────────────────────────────
  It was written claiming that without it `array_length('{}', 1)` returns NULL
  and the clause would go vacuous for empty arrays. **Perturbation says no:**
  removing both `coalesce` calls fails nothing, because a CHECK passes on NULL
  exactly as it passes on TRUE, so an empty array is accepted either way — which
  is the outcome wanted.

  The same shape as the evidence constraint's null-guard, recorded in
  ARCHITECTURE.md as the counterexample. Kept for the same reason and with the
  same label: it makes the arithmetic explicit instead of borrowing correctness
  from NULL semantics, so it becomes load-bearing the day someone writes
  `>= 1` here. Recorded as belt-and-braces rather than claimed as a guard.
*/
alter table public.interview_rounds
  add constraint interview_rounds_code_fits_the_round
    check (coalesce(array_length(code, 1), 0) <= asked);

/*
  And a ceiling. Ninety minutes is three problems, and `asked` alone would not
  catch a runner that asked four — this clause says the product decision out
  loud, where a later arc has to argue with it rather than drift past it.
*/
alter table public.interview_rounds
  add constraint interview_rounds_code_is_bounded
    check (coalesce(array_length(code, 1), 0) <= 3);
