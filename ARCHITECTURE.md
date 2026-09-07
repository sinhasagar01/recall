# Architecture

Recall is a personal learning library. Supabase is the entire backend — Postgres,
Auth and Storage. There is no ORM, no client state library and no separate API
server.

## Layers

```
src/lib/domain/      pure functions · ZERO Supabase imports · 100% unit tested
src/lib/data/        topics.ts — the ONLY module that imports a Supabase client
src/lib/supabase/    client.ts · server.ts · middleware.ts (all via @supabase/ssr)
src/components/ui/   primitives: Button, Select, ConfidenceMeter, Field, Chip,
                     Sheet, Modal, Toast, Skeleton
src/components/topics/ feature components
src/app/(auth)/      sign-in, sign-up
src/app/(app)/       library, topic/[id], practice, weak
supabase/migrations/ numbered SQL migrations
supabase/tests/      pgTAP tests
e2e/                 Playwright specs
```

### The rule that matters

**Every business rule is a pure function in `src/lib/domain`.** Practice
selection order, search matching, grade-to-confidence mapping, category
suggestion — all of it.

The test for whether a rule is in the right layer: *if you need a database to
test it, it is in the wrong layer.* Selecting which ten topics to practise is a
sorting problem over an array, not a query. Keeping it that way is what lets the
rules be tested exhaustively in milliseconds, and is why `src/lib/domain` may not
import a Supabase client — not even a type from one.

`src/lib/data` is the only place that talks to Supabase. It fetches rows and
hands plain data to the domain layer; it does not make decisions. Components read
from `src/lib/data` and render — they do not re-implement rules inline.

## Why the Topic type is hand-written

`src/lib/domain/types.ts` defines `Topic` by hand, matching the migration column
for column. It is **not** generated from the database, and `npm run db:types` is
deliberately not wired into anything.

A generated file is shaped by Supabase — nested under `Database['public']['Tables']`,
carrying `Row`/`Insert`/`Update` variants and Supabase's own type helpers. Importing
it into `src/lib/domain` would put a Supabase-shaped type at the centre of the one
layer whose whole purpose is not knowing Supabase exists. The rule would survive in
the lint config and die in practice.

Phase 5 maps the generated row type onto `Topic` **at the data boundary**, in
`src/lib/data`. That is the only place allowed to know both shapes.

Two consequences worth stating:

- `difficulty`, `confidence` and `tags` are non-null, because a later migration
  added the NOT NULL the originals were missing. See the next section — that
  omission is worth recording, not just fixing.
- Timestamps are ISO-8601 strings, and are compared by `Date.parse`, never
  lexicographically. `2026-03-01T00:00:00+02:00` is *earlier* than
  `2026-03-01T00:00:00Z` but sorts later as a string.

If the migration changes, this file changes with it, and the pgTAP `columns_are`
assertion is what catches a drift in the other direction.

## The rule: a CHECK must be proven to reject, not proven to accept

Three times now a constraint on `public.topics` has passed a row it was written to
stop, and every time the cause was the same: something in the expression evaluated to
**NULL**, and Postgres rejects a row only when a CHECK is *false*. Reasoning has failed
to catch this twice; a test caught it all three times.

So it is a rule rather than a note:

> **Every clause of every CHECK on this table carries an assertion that fails when that
> clause is removed.** Proving the constraint accepts a valid row proves nothing — the
> hole is always in what it lets through. Perturbing each clause and watching a named
> assertion go red is the standard, not an extra step.

`supabase/tests/quiz_shape_test.sql` is the worked example: removing the index-range
check reds three named assertions, removing the image clause reds one, removing a
single `coalesce` reds one.

### The two NULL sources that have actually bitten

- **A nullable column compared to anything yields NULL.** `check (difficulty in
  ('easy','medium','hard'))` is NULL for a null input, so the constraint that looks like
  it enumerates the legal values passes a null straight through.
- **`array_length` of an EMPTY array returns NULL, not 0.** `array_length('{}'::text[], 1)`
  is NULL, so `array_length(options, 1) >= 2` is NULL for `options = '{}'` and a quiz with
  no options at all satisfied a constraint demanding two.

### The reasoning that was wrong, recorded because it will be repeated

The quiz migration originally carried this comment:

> *"`kind` is NOT NULL, so every branch of the CASE evaluates to a real boolean."*

It is wrong, and plausibly wrong, which is worse. `kind` being NOT NULL guarantees the
CASE picks a branch — it guarantees nothing about the expression inside that branch. The
branch was `... and array_length(options, 1) >= 2 and ...`, and one NULL conjunct makes
the whole conjunction NULL.

**A NOT NULL discriminant does not make a CHECK total.** Whatever is inside the branch
has to be shown to be total, clause by clause, and the way to show it is the
perturbation above rather than an argument.

### A perturbation must be applied where the change would actually arrive

The evidence phase perturbed `practice_ordered_page` by editing the migration that created
it — a migration that runs *before* the evidence columns exist. The reset failed, every
test went red, and the output looked exactly like a perturbation working. It was not one:
nothing had been tested, because the schema never built.

> **A perturbation that breaks the migration order fails everything for the wrong reason,
> and that is indistinguishable from success unless you read which assertions failed.**
> The honest version simulates how the change would really arrive — here, a later
> migration doing `create or replace`.

The same applies to any perturbation that breaks compilation rather than behaviour: a
red suite is only evidence when the *named* assertion you predicted is the one that
failed.

### Verify the perturbation applied before believing its result

Two results in the sources arc reported **"0 failed"** because the regex doing the editing
never matched — the clause was never perturbed at all. That is *indistinguishable from a
redundant clause*, and it points the same way: "this clause does nothing, delete it".

It is the twin of the entry above. One fails everything for the wrong reason; the other
fails nothing for the wrong reason. Together:

> **A perturbation is evidence only once you have confirmed the perturbed text is actually
> present — in the file, and in the installed object.** Then read the result. `grep` the
> file for the replacement, and for a database object read it back with
> `pg_get_constraintdef` or `pg_get_functiondef`.

Both halves have now cost real time: a `create or replace` that Postgres silently refused,
and a regex with unbalanced parens that silently matched nothing.

### Testing RLS: a `with check` failure raises, a `using` failure does not

A fact about Postgres rather than about this schema, and every future table will need it.

- **`using`** decides which rows the statement can *see*. A row it hides is simply not
  matched, so an unauthorised `update` or `delete` **affects zero rows and returns
  quietly**. Assert it with a row count — `tests_affected` in these files.
- **`with check`** decides which rows the statement may *write*. A violation **raises
  42501**. Assert it with `throws_ok`.

Using the wrong shape is not a failed assertion, it is an aborted file: `tests_affected` on
a with-check violation throws inside the helper and pgTAP stops, taking every assertion
after it with no useful message. That happened in this arc on the first attempt to prove a
caller cannot give a source away by rewriting its `user_id` — the row is the caller's own,
so `using` passes and only the with-check stops it.

The practical consequence: **the two halves of a policy need separate assertions**, and the
half that is already covered by a `to authenticated` role clause is not the half worth
testing. See the entry below.

### Three vacuous assertions in one phase, all caught by perturbation

Worth recording as a count, because the argument for the standard is its hit rate. Every
one of these was a green assertion that proved nothing, and reasoning had already
approved all three:

| what was wrong | how it looked | what caught it |
| --- | --- | --- |
| the `note is null or` disjunct was redundant | a clause with a written NULL analysis | removing it failed nothing |
| four of nine constraint clauses untested | a thorough-looking 26-assertion file | blanking them failed nothing |
| the queue-ordering assertion could not move | a passing pgTAP test of the failure mode | the tie-break perturbation still passed |

The third is the subtlest and the most worth remembering: it was green because of **where
the fixture put the data**, not because of any logic. Evidence had been placed on the topic
that already sorted second, so a tie-break that promoted evidenced topics left the order
identical. The fix was to assert both placements — evidence on the first topic and on the
second — so a tie-break in either direction moves something.

### The counterexample: a clause that provably cannot bite, and stays anyway

The evidence constraint was written with this prediction attached, in the migration, in
advance:

> *"the RIGHT operand IS NULL when the note is NULL. The left disjunct is the only thing
> standing between this constraint and passing on a null note."*

**Wrong, and the perturbation is what caught it.** Removing
`x_note is null or` from `(x_note is null or length(btrim(x_note)) > 0)` fails **nothing** —
not one assertion out of thirty.

Why it cannot bite, which is worth having written down because it is the general shape:

> **`NULL and false = false`.** A NULL comparison can therefore only weaken a would-be
> TRUE into NULL — and a CHECK passes on NULL exactly as it passes on TRUE. So a NULL
> conjunct can never *rescue* a row that another clause already rejects. The rows that
> actually reach that clause with a null note are the rows with no evidence for that
> marker, which must be accepted anyway.

The clause that rejects a date-without-a-note is the coupling on the line above it,
`(x_at is null) = (x_note is null)`, which is boolean on both sides and cannot be NULL.

**The clause stays, relabelled.** It makes that line independently NULL-safe instead of
borrowing its safety from the clause beside it, so if the coupling were ever loosened it
becomes load-bearing. But it is now recorded as belt-and-braces rather than claimed as a
guard, and that distinction is the point: every one of the three bugs above was a clause
*assumed* to bite that did not. The rule is unchanged — **perturb every clause** — and
what changes is what a zero-failure result means. It is not automatically dead code to
delete; it is a claim to re-derive, and sometimes the honest answer is "redundant, kept,
here is why".

## A symmetric rule needs symmetric tests — four phases running

Four consecutive phases have had perturbation find green assertions that proved nothing,
and **all four were the same mistake**: a rule stated N times, with the tests exercising
one instance.

| phase | the rule, stated N times | what the tests exercised |
| --- | --- | --- |
| Evidence | three markers × three clauses | blank notes and stray URLs on `rebuild` only |
| Evidence | the queue-ordering claim | evidence on the topic that already sorted second |
| Sources | three not-blank checks | none of them — every insert supplied real text |
| Sources | two halves of the insert policy | the half already blocked by `to authenticated` |

The generalisation, which the section below states for one shape and is worth stating
plainly for all of them:

> **"It passed" on one instance says nothing about the others.** A rule written N times
> needs N assertions, and the instance a test happens to use is chosen by whoever wrote the
> fixture — not by what the rule covers.

The last row is the subtlest and the most transferable. An insert policy has two
independent guards: `to authenticated` stops the signed-out caller, and `with check` stops
the *signed-in* caller writing into someone else's account. Testing anon proves the first
and says nothing about the second, and it reads as thorough — the test is literally named
for the threat model. Relaxing the with-check to `true` failed **zero** assertions until
one was added that inserts a row with a forged `user_id`.

## A constraint written N times over N markers needs N tests, or you have tested the loop body once

The same evidence constraint states nine clauses: three rules — a date/note coupling, a
stray-URL guard, a blank-note guard — applied identically to `rebuild`, `challenge` and
`production`.

Perturbing them found **four of the nine failed nothing**. Not because they were
redundant: because every assertion in the file put its blank note and its stray URL on
`rebuild`, and no test had ever put one on the other two markers. Two thirds of a
symmetric rule was decoration, and it read as thorough.

> **When a rule is written N times over N markers, the tests must exercise all N.**
> Testing one marker is testing the loop body once and calling the loop covered.

This belongs beside "a fixture with no spread on a dimension cannot test that dimension"
below — same family, different axis. There the fixture had no spread on a *value*; here
the assertions had no spread across a *repetition*. Both present as a green suite that has
never been asked the question.

The four missing assertions were added and all nine clauses now bite. The perturbation run
is what produced them, which is the argument for the standard existing at all.

## What a type change catches, and what it is blind to — a matched pair

Two phases ran the same experiment from opposite directions and got opposite blind spots.
They are recorded together because neither is the lesson on its own.

| | quiz phase | evidence phase |
| --- | --- | --- |
| The change | added a discriminant, `kind`, splitting `Topic` into two arms | added nine fields to the SHARED interface |
| What `tsc` caught | **consumption** — using a value where its type no longer fits | **construction** — every site that builds a `Topic` must now supply them |
| Errors | 2 | 5 |
| What it missed | **7 of 9** `.definition` reads — every one whose result was renderable | **every consumer** — the detail page, the library card, `library.md`, `TOPIC_COLUMNS`, `COLUMNS` |
| Who holds the gap | Playwright absence assertions | Playwright, export and pgTAP assertions |

The two blind spots are complementary and together they cover most of a schema change.
Neither compiler result is a map of the work:

> **After a type change, count the errors against the number of sites you expected to
> change.** A shortfall is not evidence there is nothing to do — it is the map of what the
> compiler cannot see, and it is where the hand-written assertions have to go.

In the evidence phase the shortfall was the whole feature: five errors, all fixtures, while
every screen that must display evidence and every query that must select it compiled
perfectly and was wrong. `toTopic` did not error either, correctly — it spreads the row —
and `TopicBoundaryIsSound` stayed satisfied because both arms gained the keys at once,
which is the assertion doing its job by *not* firing.

### Omitting a column from the domain type: two reasons, and only one is negotiable

`TopicRow` omits two columns from the generated row, and **the reason must be written at
the omission**, because the reason decides what is allowed to change later.

| column | reason | if that changes |
| --- | --- | --- |
| `search_text` | **nothing reads it.** A generated column that exists so the trigram index has something to index | the omission is simply *wrong* and should be removed |
| `source_id` | **plenty reads it** — the detail page, the workspace, the write path. It is omitted so the queue *cannot* | the omission is **load-bearing** and removing it silently breaks a guarantee |

The second kind is the one to be careful with. `sources-boundary.test.ts` forbids every
source column in every queue module **with no exception**, and that is only possible
because the domain `Topic` has no `source_id`: if it did, `TopicBoundaryIsSound` would
oblige every read to return it — including `practice_ordered_page` — and the test would
need a carve-out for the single module it most needs to cover.

So it cannot be relaxed for local convenience. "I just need `source_id` on `Topic` here"
is the change that quietly turns an absolute rule into a rule with an exception, and the
exception is in the queue.

Both reasons now sit side by side in `src/lib/data/topic-mapping.ts`, which is the
reference for this rule. "We omit columns sometimes" is not something anyone can apply.

### Two mention-guards plus one structure-guard

A rule enforced by forbidding a *mention* needs a companion assertion forbidding the
*structure* that would make the mention legitimate. Otherwise the guard is one refactor
away from being satisfied by a change that defeats it.

`sources-boundary.test.ts` is the shape:

1. **Mention, TypeScript** — no queue module names a source column.
2. **Mention, SQL** — no practice or weak migration names one. The ordering runs in SQL, so
   the TypeScript check alone would miss a join.
3. **Structure** — `source_id` is not on the domain `Topic` and `TopicRow` omits it.

Without the third, someone adds `source_id` to `Topic` for a good local reason, the queue's
reads legitimately gain the column, and the first two guards are then *obliged* to be
relaxed — each change reasonable, the guarantee gone. The structure guard is what makes the
mention guards absolute rather than conventional.

`evidence-boundary.test.ts` has the first two and not the third, which is correct for it:
evidence columns are on the domain `Topic` by design, so there is no structure to forbid.
The pattern is not "always three" — it is *"if the rule depends on a structural fact, assert
the structural fact"*.

### A discriminated union only catches reads it makes type-incompatible

The same shape of lesson as the CHECK rule above, found the same way: by a test, after
reasoning said otherwise.

Adding `kind` to `Topic` was expected to be "the map" of every place assuming one shape —
each read would become a compile error until narrowed. It was not. Of the nine reads of
`.definition`, **`tsc` flagged two.**

`definition` exists on *both* arms — `string` on a topic, `null` on a quiz — so reading it
is always legal and yields `string | null`. Only **consuming** it where a `string` is
required errors. Everywhere a null is renderable, the compiler stays silent:

| Site | What it does | Compiler |
| --- | --- | --- |
| `domain/export.ts` | passes it where a `string` is required | error |
| `__fixtures__/build-parity-sql.ts` | same | error |
| `topics/topic-card.tsx` | `{topic.definition}</p>` | **silent** — JSX renders null as nothing |
| `topics/topic-detail.tsx` | same | **silent** |
| `practice/practice-session.tsx` | same | **silent** |
| `topics/topic-sheet.tsx` | `topic?.definition ?? ''` | silent, and already correct |
| `domain/search-filter.ts` | into a `(string \| null)[]` that skips nulls | silent, and already correct |

The three silent component reads are the dangerous ones: a quiz card would render an
**empty** excerpt where the reference specifies none at all. It looks almost right, which
is the worst kind of wrong, and no type error ever appears.

**Playwright holds those three, not `tsc`** — `e2e/quiz.spec.ts` asserts the excerpt
element, the Definition section and the Definition register are *absent* for a quiz. The
assertion has to be absence: "the element is missing" fails before narrowing and passes
after, while "the text is empty" passes in both states and proves nothing.

The general rule: **a field present on both arms with different nullability is invisible to
the compiler wherever null is renderable.** Adding a discriminant tells you where the
shapes are *used* incompatibly, never where they are merely displayed.

### Adding fields to a shared interface catches construction, and only construction

The mirror image. The nine evidence columns went onto `TopicShared`, and `tsc` returned
five errors: one hand-written row literal and four builder functions — `makeTopic`,
`makeQuiz`, and the corpus's `topic()` and `quiz()`. All four builders failed identically,
because `{...defaults, ...overrides}` with `overrides: Partial<T>` yields
`string | null | undefined` and `undefined` is not `null`.

Every *reader* compiled. That is not a smaller version of the union's blind spot, it is the
opposite one: adding a field breaks producers and is silent about consumers, because code
that ignores a new field is still valid code. The sites that had to change and did not
error were the detail page, the card, the markdown export, and both explicit column lists —
each of which would have shipped a feature that silently stored data nothing displayed.


## An assertion about a row in a paged, ordered list is not an assertion about the row

The third of the same family, after the CHECK rule and the union rule above. All three are
assertions that *passed while proving nothing*, and all three were caught by making the
thing they claimed to test actually change.

The quiz work needed to show that confidence is one system across both shapes — "a weak
quiz and a weak topic sit in the same list". The obvious Playwright test: answer a quiz
wrong, go to `/weak`, assert the question is visible; answer it right, assert it is gone.

It failed about one run in six, and the failure was the *correct* half. The `/weak` page is
ordered and paged at `SERVER_PAGE_SIZE` (60), and the fixture user has **275** rows needing
review. A just-answered weak quiz sorts to the end of its bucket and lands on page 5. The
"it is visible" assertion had been passing on ordering luck, and the "it is gone"
assertion could never have failed for the right reason — a quiz genuinely still in the weak
set is invisible on page 1 exactly as a correctly-removed one is.

**Absence from a paged list is not absence from the set, and presence is a fact about the
ordering.** Both halves were measuring the fixture's size.

The rule, in two parts:

- **Put the set-membership claim where the query can be interrogated.** It moved to
  `supabase/tests/quiz_shape_test.sql`, which calls `practice_ordered_page` directly with a
  limit above the row count and asserts a weak quiz and a weak topic come back from the one
  call. That is the claim, stated against the thing that decides it.
- **Read the outcome somewhere unpaged in the browser test.** The Playwright test now reads
  the confidence off the quiz's own library card, found by search. One row, addressed
  directly, no ordering involved.

The mechanical check when writing an assertion about a list: **if this row moved to page 2,
would the assertion still mean what I think it means?** If not, the assertion is about the
page, not about the row.

A related trap in the same test, worth recording because it is the same mistake wearing
different clothes: the practice screen's verdict line ("Marked weak") renders the instant
Check is pressed, derived from the pick in the browser — not from the response. Asserting on
it and then navigating raced the write, and it would have read "Marked weak" just as happily
if the write had failed outright. The synchronisation point is the continue button, which
stays disabled and reads "Saving…" until the action resolves. **Do not treat optimistic
copy as evidence that a write happened.**

## A CHECK constraint does not imply NOT NULL

`public.topics.difficulty`, `.confidence` and `.tags` originally carried a default,
and the first two carried a CHECK — but none carried NOT NULL. That is not enough,
for two reasons that are easy to conflate:

- **A column default only covers an omitted value.** `insert ... (difficulty) values (null)`
  states a value, so the default never applies.
- **A CHECK constraint passes on NULL.** `check (difficulty in ('easy','medium','hard'))`
  evaluates to NULL — not false — for a null input, and Postgres rejects a row only
  when a CHECK is *false*. A null slipped straight through the very constraint that
  looked like it was enumerating the legal values.

The result was a null case that should never have existed, inherited by every
consumer: the domain layer carried `Difficulty | null` and a pair of normalising
functions that existed for nothing but that.

Fixed by a forward migration (`*_topics_not_null.sql`) that backfills to the column
defaults and then adds NOT NULL. The original migration was left exactly as applied.
`topics_test.sql` now asserts both halves — `col_not_null` on the catalog, and that
an insert explicitly setting each column to null is rejected with `23502`. Those
assertions were run against the previous schema first and reported
`caught: no exception`, which is what proved the hole was real and reachable.

**The rule: if a column enumerates its legal values, it almost certainly wants NOT NULL
too.** A CHECK says what a value may be, never that there must be one.

## Seeding belongs to the test runner, not to an npm script

`test:e2e` used to be `seed:e2e && build && playwright test`, so the suite was correct
only when run that way. `npx playwright test` — the command you actually use while
iterating on one spec — skipped the seed, and each run left roughly 52 topics behind on
the general-purpose fixture.

Past `LOCAL_MODE_MAX` the library stops being read whole and is served a page at a time,
so the seeded rows fall off page one and specs that have nothing to do with each other
start failing. Measured, by inflating the fixture deliberately rather than by waiting for
it:

| fixture rows | failing specs |
| --- | --- |
| 604 | 1 |
| 785 | **13**, across `a11y`, `image`, `library` and `quiz` |

Not one of those thirteen mentions a fixture size anywhere. That is the whole problem: the
suite degrades into a spread of unrelated locator timeouts.

**Two entry points and only one of them correct is the bug**, so the fix is one door:
seeding runs in `globalSetup`. There is no invocation of Playwright that can skip it —
`npx playwright test`, `-g "one test"`, an IDE runner and `npm run verify` all go through
it. The duplicate was removed from `test:e2e`, which now only builds and runs.

### The consequence, stated rather than discovered

**Every Playwright invocation now deletes the fixture users' topics.** Running a single
spec with `-g` wipes a topic you made by hand on the general-purpose fixture. That is the
price of making the failure impossible instead of merely recoverable, and it belongs here
rather than in a surprise at the keyboard. It costs 2.3 seconds a run, against the five
browser sign-ins `globalSetup` already performs.

### The guard, and what it is actually for

`e2e/fixture-invariants.ts` lists what each fixture must look like and runs immediately
after seeding. With seeding in `globalSetup` it is a **regression net for the seed**, not
the primary fix — and it earns its place on the failure message alone:

```
Fixture invariants are broken — aborting before any spec runs.

  ✗ "main" must hold at most 500 topics, so the library is read whole rather than a page at a time
      it currently holds 760 topics
      relied on by: everything that expects a seeded row to be on the first page
```

Three of its seven invariants were **silent** dependencies, found by reading the specs
during the post-mortem rather than by anyone knowing they existed: `few` holding exactly
the two titles `export.spec` asserts by name, `strong` holding the two the export and weak
specs look for, and `large` holding `Bulk topic 0007`. Any of them could have broken and
presented as an unrelated timeout.

Hence the rule the file states in its own header: **a spec that depends on a fixture's
shape must add its invariant there, and a spec relying on an unlisted property is relying
on luck.**

## A fixture with no spread on a dimension cannot test that dimension

The fifth time fixture composition has hidden something in this project, and by now the
pattern is worth stating as a rule rather than rediscovering.

Every seeded user was created with rows stamped `now()`. That is invisible until an
assertion depends on a date — and then it is not merely unhelpful, it is **actively
misleading**, because the assertion passes. The library's "newest first" rule splits on
`RECENT_WINDOW_DAYS`; on a fixture where every row is seconds old, everything is recent,
the non-recent branch is empty, and the buggy layout and the fixed one render identically.
A test written against it would have gone green on day one and stayed green forever.

**The rule: a shared fixture with no spread on a dimension cannot test anything that
depends on that dimension, and a passing assertion against it proves nothing.** The
mechanical check when writing a fixture-backed test: *what would this fixture have to look
like for my assertion to be able to fail?* If the answer is "different from how it looks",
the fixture is the first thing to fix.

The four earlier instances, for the shape:

| Where | The dimension with no spread |
| --- | --- |
| `practice_ordering_test.sql` | three weak topics, so a wrong staleness order had a good chance of matching a right one — now twelve with distinct stamps |
| `practice_ordering_test.sql` | the 40-row tie group carries no difficulty at all, so any difficulty ordering would be untested |
| `library_parity_test.sql` corpus | no two same-staleness rows differ in difficulty |
| `e2e-few` / `e2e@recall.test` | every row created seconds ago |

`scripts/seed-e2e-user.mts` now backdates the two `few` topics and seeds two backdated
topics on the general-purpose user, which is the one specs are free to write to.

## A harness proving two modes agree on DATA does not prove they agree on what is RENDERED

The library reads two ways — the whole library in memory under `LOCAL_MODE_MAX`, SQL past
it — and `library_parity_test.sql` holds the two to agreement id-for-id and count-for-count
over a shared corpus. That harness is correct and it is doing its job.

It could not see that **the same library rendered in a different order either side of the
500-row boundary.** The "Recently learned" split was applied in JSX, downstream of
everything the harness checks: local mode partitioned the rows into non-recent and recent
and drew them in that order, while server mode drew the single list it was given. A
library at 499 topics and the same library at 501 disagreed about where a topic saved five
seconds ago appeared.

This is **a gap in coverage, not a gap in the harness**. Parity's subject is the data
layer and it should stay there; extending it to assert on rendering would make it a
component test wearing a pgTAP costume. The lesson is where the *next* mode-dependent
render belongs: any branch on `data.mode` in a component is a place the two modes can
diverge with every data assertion still green, and it needs its own test at the layer it
lives in.

The fix removed the branch rather than testing it. That is the better outcome where it is
available: the rendered order is now mode-independent by construction, because there is no
longer a mode-dependent code path to disagree.

## What "needs review" means

`needsReview` is one predicate with several callers: the rail's count, the library
subtitle, and (phase 9) the Weak Topics page itself.

**The rule comes from the product spec: Weak Topics shows `confidence = 'new'` OR
`confidence = 'weak'`.** The mock's numbers happen to agree — its confidence select
reads Never practiced 4 and Weak 7, and its weak page reads "11 topics" — but that
agreement is a consequence of the rule, not the reason for it. A count that lined up
by coincidence would be a bad thing to build on.

## One definition of "never practiced"

`isNeverPracticed()` in `src/lib/domain/confidence.ts` is the only definition, and
both callers use it: the never-practiced bucket in practice selection, and the
"Never practiced" quick filter on the library.

**It means `confidence === 'new'`, not `last_practiced_at === null.`** The two can
genuinely disagree, because Edit can set confidence directly without ever practising
a topic. Confidence wins because DESIGN.md, "Signature components" labels the confidence value `new` as
"Never practiced" and the mock's confidence select lists it *as* a confidence value —
so a card's meter and the filter always agree. Keying on `last_practiced_at` would
let a card visibly labelled "Weak" appear under a "Never practiced" filter.

The other half of that disagreement is handled in practice selection: a topic with
no `last_practiced_at` has an *infinitely long gap* and sorts first within its own
bucket. A weak topic never practised outranks a weak topic last practised in March.
It is the stalest thing in the bucket, not a tie left to the shuffle.

## Determinism in the domain layer

No function in `src/lib/domain` reads the clock or a random source. Time arrives as a
`now: Date` parameter and randomness as an injected `shuffle`. A test that would pass
at 3pm and fail at midnight means the function is wrong, not the test.

Two details that matter more than they look:

- **`selectPracticeSession` takes no clock.** Ordering by longest gap is identical to
  ordering by oldest `last_practiced_at` — `now` is the same for every topic and
  cancels out. An unused parameter would be a lie about what the function depends on.
  `filterTopics` genuinely needs one, for the two recency filters.
- **The shuffle never goes inside the sort comparator.** Randomness in a comparator
  makes it non-transitive, and the result of `Array.prototype.sort` then becomes
  implementation-defined — it can reorder across buckets entirely. Topics are sorted
  by a total order first, then runs of exactly-equal keys are shuffled.

`RECENT_WINDOW_DAYS` is a single exported constant used by both "recently added" and
"recently practiced". Tests reference the constant, never the literal.

## Auth: the three clients, and where the session actually lives

`src/lib/supabase/{client,server,middleware}.ts` are the only modules in `src/` that
import a Supabase client. `scripts/seed-e2e-user.mts` also does — it is tooling, not
application code, and it is the only thing that touches the secret key.

Versions this was written against: **@supabase/ssr 0.12.5**, **@supabase/supabase-js
2.112.4**. Two details come from the installed package, not from memory, and both fail
silently if you copy an older snippet:

- **`setAll` takes a second argument, `headers`.** They are cache headers
  (`Cache-Control: private, no-cache, no-store, …`) that must be written onto the
  response so a CDN cannot serve one user's session cookie to another. An
  implementation that ignores the parameter still typechecks.
- **The deprecated `get`/`set`/`remove` cookie methods must not be used.** The
  package's own JSDoc says they cause "random logouts, early session termination,
  JSON parsing errors".

### Email confirmation and password reset

Both are the same shape: the auth server emails a link, the app exchanges what is in
that link for a session. One route handler, `src/app/auth/confirm/route.ts`, does the
exchange for both, because there is nothing type-specific about it — it reads
`token_hash` and `type`, calls `verifyOtp`, and forwards to `next`.

**The stock email templates cannot be used.** They link to Supabase's own `/verify`
endpoint, which redirects with the tokens in a URL *fragment*. A fragment never reaches
the server, so an SSR app gets a confirmed user and no session. The templates in
`supabase/templates/` link to `/auth/confirm?token_hash=…&type=…` instead, which is a
normal query string the route handler can read.

`next` is checked to be a relative path before it is used. It arrives from a URL, so
without that check the confirmation link is an open redirect.

Sign-up therefore no longer signs you in, and `signUp` returns `pendingFor` rather than
redirecting — `data.session === null` is how the client distinguishes "account created,
go and check your email" from a session it can use.

The reset request deliberately reports the same thing for an address that exists and one
that does not. Anything else turns the form into a way to enumerate registered accounts.
Supabase does not distinguish either, so the only work here is not undoing that.

**No `redirectTo`.** The template already builds its link from `{{ .SiteURL }}` and
carries its own `next`. Passing `redirectTo` as well means two sources of truth for the
same URL, and an empty or relative value is rejected outright as not being in the
allow-list — which surfaces as a reset that silently never sends.

Locally the mail goes to Mailpit on :54324, and the e2e specs read it there over the
Mailpit API and follow the real link. Nothing about the email path is stubbed. In
production SMTP is Resend, configured in the hosted project rather than in this repo.

### Next.js 16 renamed `middleware` to `proxy`

The root convention file is **`src/proxy.ts`**, exporting a function named `proxy`.
`middleware.ts` is deprecated in Next 16, and the edge runtime is not supported for
proxy — it always runs on nodejs.

It lives in `src/`, not the repository root, because the convention is that it sits
*at the same level as `app`*. With `src/app`, a root-level file is silently ignored:
the app still builds, sign-in still works, and only the route guards quietly do
nothing. That is exactly how it failed here before being moved.

### The rule that keeps the session alive

`updateSession()` builds **one** response and never replaces it without carrying the
cookies across:

1. `setAll` writes each cookie to `request.cookies` (so the current render sees the
   refreshed session), rebuilds the response from the updated request, then re-applies
   every cookie and the cache headers to it.
2. **Redirects copy the cookies from that response onto the redirect.** Constructing a
   fresh `NextResponse.redirect()` after a refresh drops the new session — and only on
   the redirect path, which is why it presents as an intermittent, unreproducible
   logout.

`src/lib/supabase/server.ts` swallows the error from `cookieStore.set` in a server
component, which cannot set cookies. That is only safe *because* the proxy exists and
has already performed the write. If the proxy stops matching a route, that `catch`
turns a loud failure into a silent one.

### getClaims vs getUser

The proxy calls `getClaims()` — it triggers the refresh and is what the package
documents for this position. The library page calls `getUser()`, which asks the auth
server and is authoritative, because it is deciding what to render for a real user
rather than performing an optimistic route check.

## The data boundary

`src/lib/data/topics.ts` is the only module that reads or writes topics, and
`src/lib/data/topic-mapping.ts` is the only place a database row becomes a domain
`Topic`. Everything above works in `Topic`s and never sees a row.

**The boundary rule: identical shape, two columns narrowed.** `supabase gen types`
widens `confidence` and `difficulty` to `string`, because a CHECK constraint does not
narrow into TypeScript. Narrowing them is the only work the mapping does.

`TopicBoundaryIsSound` in `topic-mapping.ts` asserts both directions of assignability
between the generated row and the domain type, and `tsc --noEmit` runs first in
`npm run verify`. A column added, renamed, or made nullable on either side fails the
build there. Verified by renaming one domain field and watching the build break.

`toTopic` **throws** on a confidence or difficulty outside its union, naming the row.
That is unreachable while the CHECK holds; if it ever fires, the migration and
`src/lib/domain/types.ts` have diverged, and coercing to a default would quietly
misfile the topic instead of saying so.

`src/lib/domain` still imports neither a Supabase client nor `database.types`. The
generated file is committed so the boundary is checkable in CI without a database.

### Reads through server components, writes through Server Actions

Chosen over client-side mutation because the first paint carries data with no client
waterfall, the publishable key and RLS stay on the server, and phase 3 already writes
this way. `revalidatePath('/library')` is what updates the list without a reload.

`listTopics` is wrapped in React's `cache()`, so the rail and the page share one query
per request rather than issuing the same select twice. It returns `readAt` alongside
the rows: relative times are relative to *the read*, and taking the clock there keeps
`Date.now()` out of render, where it is impure and would drift between the two.

## The mental-model image

### Server-side validation lives on the bucket

`file_size_limit` and `allowed_mime_types` on the `mental-models` bucket are the rule.
A browser `accept=` attribute and a size check in JavaScript are affordances for the
person using the form; the bucket's limits apply to every caller, including one that
never loads our JavaScript.

Phase 1 gave the bucket its four RLS policies, and **RLS answers who may write, never
what**. Nothing could upload until phase 10, so the shape of an acceptable upload had
not come up. `*_mental_models_bucket_limits.sql` adds only those two columns — no new
policies, no new tables. `MAX_IMAGE_BYTES` and `ALLOWED_IMAGE_TYPES` in
`src/lib/domain/mental-model-image.ts` are the single source, quoted by the migration
and asserted against it in pgTAP.

### Upload goes browser-direct

`src/lib/data/mental-model-image.ts` is the second module in the data layer and the
only one that runs in the browser — `topics.ts` is `server-only`. Uploading direct to
Storage avoids routing megabytes through a Server Action, which would also need its
body limit raised. RLS still applies: the insert policy checks that the first path
segment is the caller's own user id.

### What the storage client cannot do

`upload()` takes `cacheControl | contentType | upsert | metadata` — **no progress
callback and no abort signal**. Two consequences, both stated rather than faked:

- The progress bar is **indeterminate**. A percentage would be invented.
- **Cancel is app-level**: the upload is marked abandoned and, when it resolves, the
  object it created is deleted. The request cannot be stopped, so nothing is left
  behind instead.

### The three orderings

**Save**: insert row → upload → patch path. The object path needs the topic id, so
the upload cannot come first. From the moment the row exists it is **saved**: no
failure below rolls it back, and the banner names the real reason — the file, its real
size, the real limit.

**Replace**: upload new → patch path → remove old. If the removal fails the topic
already points at a valid new object, so the cost is an orphan rather than a broken
topic. An orphan is acceptable; leaking one silently on every replace is not, so
`setMentalModelImagePath` returns `orphanedPath` and the sheet says the previous file
could not be removed.

**Delete**: object → row. A failure removing the object leaves the row intact and the
operation retryable, and the user is told "The topic was kept — try again." The
reverse would orphan an object whose only recorded path was the row just deleted.

### No layout shift

Signed URLs are created during the **server render** — on the detail page and for the
whole practice queue at once — so they are in the first paint and nothing resolves
client-side. The figure reserves its box with `aspect-ratio`, so decode cannot shift it
either. The card shows no image at all, only `Model ✓`.

## Deleting an account

The same ordering rule as deleting one topic, for the same reason: **storage objects
first, then the auth row.** A failure removing images leaves the account intact and the
whole operation retryable; the reverse orphans every image the account owned with
nothing left pointing at them, and no SQL statement or trigger can reach a storage
object to clean up afterwards. Topics are not deleted explicitly — `on delete cascade`
on `topics.user_id` handles them, and never had any reach into storage.

### Where admin privilege lives

`src/lib/data/account.ts` is the only module in the app that uses the secret key, and it
does one thing: `auth.admin.deleteUser`. Supabase does not expose self-deletion through
the client SDK, so this cannot be done with the user's own session.

Everything else runs as the user. Listing and removing their images uses their own
session, because the phase 1 storage policies already permit deleting objects under
their own `{user_id}/` prefix. Admin privilege therefore touches exactly one call rather
than the whole operation.

Who is being deleted comes from `supabase.auth.getUser()` on the server, never from
anything the browser sent. And `deleteAuthUser` throws loudly when `SUPABASE_SECRET_KEY`
is absent: a silent no-op there would report a deleted account that still exists.

## Not found and ownership are the same thing

`getTopic` uses `.maybeSingle()` and returns `Topic | null`. RLS returns zero rows
both for an id that does not exist and for one belonging to another user, so the two
take the identical path to `notFound()`. There is no `user_id` filter in the query and
no 403 branch anywhere — a status that distinguished "exists but not yours" from "does
not exist" would tell an attacker which ids are real.

Asserted end to end rather than in pgTAP, because the leak would be in the HTTP
surface: a spec creates a topic as one user, signs in as another, and asserts that its
url and a random uuid render the same page.

## Deleting a topic: the object goes first

`deleteTopicRow` is named for what it does — the row is not the only thing a topic
owns. The ordering lives in `(app)/topic/[id]/actions.ts`, with the storage removal
marked ahead of the row deletion for phase 10:

1. remove the storage object through the Storage API
2. delete the row

That order is not arbitrary. A failure at step 1 leaves the row intact and the whole
operation retryable. Deleting the row first orphans an object that nothing references
and nothing can find, because the only record of its path was the row just deleted.
And per the binding constraint above, no SQL statement or trigger can remove a storage
object, so this sequencing is the application's job and cannot be pushed into the
database.

`redirect()` sits outside the try/catch: it signals by throwing, and catching it would
swallow the navigation and report a failure that did not happen.

## Search and filtering: wiring, not logic

The library renders from **one** `filterTopics` call. Every rule it applies —
partial case-insensitive matching across title, definition, mental model, category
and tags, AND composition, the recency window — was written and tested in phase 2,
before any of this UI existed. No component contains a comparison that decides
whether a topic matches.

Counts are built the same way: each quick-filter chip's count is
`filterTopics(topics, {quickFilters:[q]}, now).length`, and `confidenceOptions` /
`difficultyOptions` delegate to `filterTopics` too. A count is therefore, by
construction, exactly what selecting that option yields — it cannot drift from the
thing it describes.

**Counts reflect the full library, not the filtered set.** The reference settles it:
with a query matching nothing and a category filter active, its category select still
reads "All categories 48".

### Filter state lives in the URL

Written with `window.history.replaceState`, the documented Next pattern that updates
the URL without reloading the page while staying in sync with `useSearchParams`. So a
filtered view is shareable and survives a reload, with no history entry per keystroke.

**Whether that costs a round trip now depends on the size of the library** — see
"Two ways to read the library" below. Under the threshold it does not, exactly as
before. Past it, the URL is still written immediately (which is what keeps the search
input responsive, since it is controlled by the URL) and a navigation is scheduled
once typing settles.

`replaceState` for every control, not only the input: the toolbar is one continuous
act of narrowing, and stepping back through half-typed queries and intermediate filter
states is not history worth keeping.

### The gap phase 2 could not have seen

`filterTopics` could not express "category is null" — the filter treated `null` as
*unset*, so the "Uncategorized" option had nothing to send. Phase 2 had no UI
enumerating categories, so a topic without one never needed to be selectable;
`categoryOptions` (phase 5) introduced "Uncategorized" as a display label, and phase 7
was the first time that label had to round-trip back into a filter.

Fixed with `categoryOf(topic)` in `category-suggest.ts`, used by `filterTopics`,
`topicPath` and `categoryOptions` alike — so the label a card shows is exactly the
value a filter matches.

## Practice

`/practice` lives in its own route group with a layout that has **no rail**.
Retrieval practice only works if there is nothing on screen to glance at that gives
the answer away, and a sidebar reading "Weak topics 11" while you try to remember one
of them is exactly that. `proxy.ts` guards the path, not the group, so the move costs
no auth work.

Three ways in, distinguished by the URL:

| URL | Session | Floor |
|---|---|---|
| `/practice` | auto-selected by `selectPracticeSession` | applies |
| `/practice?topic=<id>` | one topic, chosen from its detail page | **does not apply** |
| `/practice?all=1` | the override from the too-few screen | waived |

The floor exists to stop an *auto-selected* session from being re-reading the same
card. Choosing one card deliberately is not that, so it is not subject to it.

### The ordering has one definition

`orderForPractice(topics, {shuffle})` produces the full practice order.
`selectPracticeSession` is that plus `.slice(0, PRACTICE_SESSION_SIZE)`.

The split exists because the weak-topics page needed the same order and
`selectPracticeSession` could not give it: the page shows every weak topic and the
session caps at ten, and a list that shuffled its ties would reorder itself on every
reload. Extracting was the alternative to writing the sort twice — two copies of
"never-practiced first, then by longest gap" would have been free to disagree, and the
one place that disagreement would show is the page whose whole job is that order.

`noShuffle` is exported alongside them so callers wanting a stable order share one
identity function rather than inlining their own.

### The practice URL scheme

| URL | Session | Floor |
|---|---|---|
| `/practice` | auto-selected | applies |
| `/practice?topic=<id>` | one chosen topic | waived |
| `/practice?all=1` | whole library, override | waived |
| `/practice?scope=weak` | everything needing review | waived |

`?scope=weak` was **added in phase 9** — it did not follow from the earlier three.
`?all=1` waives the floor but practises the whole library, and `?topic=` is a single
id; neither expresses "this subset". The floor is waived for it on the same reasoning
as `?topic=`: it exists to stop an *auto-selected* session from being re-reading the
same card, and a set the user picked is not that.

### Skip has no code path to the server

There is no skip action. Skipping advances the queue in the browser and never reaches
the server at all — which is a stronger guarantee that it writes nothing than an
action that returns null would be. The e2e spec grades a topic *first*, so all three
values are away from their defaults, then skips and asserts each is unchanged;
sabotaging skip to write flips `Strong` to `Okay` and fails it.

### Grading awaits the write

Rather than advancing optimistically. The entire value of the screen is trusting the
confidence record, and an optimistic advance puts a failed write two cards behind the
user. A failure keeps the card on screen with the real reason; the grades already
saved are unaffected, and the UI says so.

### Keeping the library correct without a mid-session reload

`gradeTopic` revalidates `/library` and `/topic/<id>` — never `/practice`. Nothing
re-renders mid-session; those routes are simply marked stale, so arriving at the
library afterwards shows the new confidence and corrected rail counts.

### The practice queue is per-request, deliberately

`selectPracticeSession` runs on each request and the queue lives in client state. There
is no session record and no `practice_sessions` table — that was a deliberate constraint,
and it holds.

The consequence, accepted rather than fixed: two tabs practising at once each build their
own queue, so the same topic can be graded twice in what feels like one session. The cost
is `practice_count` incremented twice for one review, and confidence set by whichever
grade landed last.

Supabase Realtime would narrow this — the second tab could drop a card once the first
graded it — but the event arrives *after* the write, so it is not a lock, and it would
add a publication migration, authorization config, a subscription lifecycle, reconnection
handling and a stale-UI failure mode when the socket drops. That is a lot of machinery to
prevent an occasional off-by-one for a single user. If live sync ever becomes a feature
worth having in its own right, this resolves as a side effect.

### The typed answer is ephemeral

It lives in component state, is shown back during the reveal, and is sent nowhere. No
table, no column, no action parameter.

### Randomness without impurity

`selectPracticeSession` takes an injected shuffle, and phase 2 shipped none because
nothing consumed it. `Math.random()` cannot be used here: reading a random source
during render is impure, on the server and inside a `useState` initialiser alike, and
the lint config rejects it. `seededShuffle(readAt)` seeds from data the request
already carries — pure, unit-testable, and still different every session.

## The component layer

`src/components/ui` holds the primitives from DESIGN.md, "Signature components". Nothing in there
imports Supabase, and nothing imports from `src/lib/data` — a primitive takes props
and renders. `ConfidenceMeter` imports the `Confidence` union from
`src/lib/domain/types`, which is a type, not a dependency on the domain layer.

Two shared pieces exist so the components that need them cannot disagree:

- **`use-focus-trap.ts`** — Sheet and Modal share one focus trap. Two traps is how
  they drift apart, and a half-working trap is worse than none, because it looks
  correct until someone tabs.
- **`scrim.tsx`** — one definition of what "clicking outside" means. It closes on
  *click*, not mousedown, and only when the press also *started* on the scrim.
  Closing on mousedown makes the trailing click land on an element that no longer
  exists, and the browser then resets focus to `<body>`, undoing the focus restore
  the trap just performed. Requiring the press to start there too means a text
  selection dragged out of the dialog and released over the scrim does not close it.

### The breakpoint

The reference goes mobile at **860px** (`@media (max-width:860px)`), not Tailwind's
default 768px. `--breakpoint-md` is overridden in the `@theme` block so `md:`
everywhere means the breakpoint the mock actually uses, and the layout flips all at
once rather than in pieces.

### Deriving instead of syncing

`Select` clamps its active index at read time rather than correcting it in an effect,
and sets it directly in the open handler. Effects that call `setState` to keep one
piece of state consistent with another cost an extra render pass for a value that was
derivable — the project's ESLint config rejects them.

## Test layers

Four layers. Each covers something the others structurally cannot. **A Supabase
client is never mocked to make a test pass** — if a test needs the database, it
belongs in pgTAP or Playwright.

| # | Layer | Runner | Covers |
|---|---|---|---|
| 1 | Domain | Vitest, `node` environment | Pure functions in `src/lib`. Fast, exhaustive, no I/O and no DOM. |
| 2 | Interaction models | Vitest, `jsdom` environment | Component behaviour only: Select keyboard navigation and selection, Sheet/Modal focus trap and restore, ConfidenceMeter rendering per state. |
| 3 | Database | pgTAP, against the local stack | Schema, constraints, defaults, triggers, RLS and storage policies. RLS tests create two users and assert user B can neither read nor write user A's rows or storage objects. **Written before the policies.** |
| 4 | End to end | Playwright, against `next dev` | The real user flow through a real browser. |

Vitest runs layers 1 and 2 as two separate projects (`vitest.config.mts`), with
different environments. The domain suite must never load jsdom; that separation
is enforced by config, not by convention.

### What does *not* belong in layer 2

Pages, data fetching, and anything already covered by layer 1 or layer 4. Layer 2
exists for interaction models that are tedious to drive through a browser and
impossible to express as pure functions. It is not a second place to test
business rules, and it is not a place to test rendering of whole screens.

### Typecheck

`npm run typecheck` (`tsc --noEmit`) runs first in `npm run verify`, so the
cheapest failure surfaces first. It is part of the gate but it is **not** a test
layer — the count stays at four.

## Binding constraint: deleting a mental-model image

**A mental-model image can only be deleted through the Storage API, from
application code.** SQL deletes cannot do it and neither can a database trigger.

`storage.objects` carries a `BEFORE DELETE FOR EACH STATEMENT` trigger,
`protect_objects_delete`, which raises unless the `storage.allow_delete_query`
setting is on. Being statement-level, it fires even when RLS matches zero rows.
The Storage API sets that setting; nothing in our schema does, and nothing in our
schema should.

The original brief implied a SQL cascade would clean up images. **That was wrong.**
`on delete cascade` on `topics.user_id` removes *rows* when an auth user is
deleted — it has never had any reach into `storage.objects`. There is no database
mechanism that deletes an image.

Consequences the application must carry:

1. **Deleting a topic is a two-step operation**: remove the object through the
   Storage API, then delete the row. It is not atomic and cannot be made atomic.
2. **The failure case is real and must be handled**: the row is gone but the
   object removal failed. Prefer deleting the object first — a failure there
   leaves a consistent, retryable state, whereas deleting the row first and then
   failing orphans an object nothing references.
3. **Deleting an auth user orphans their objects.** The row cascade fires; the
   images stay. Accepted for a single-user tool, and recorded here so it is not
   mistaken for a bug later.

This mirrors the add path, which is three steps for the same structural reason —
the object path needs the topic id, so the row must exist first. Both directions
are application-level sequences with partial-failure states, and DESIGN.md, "Image failure never blocks the topic"
already requires the add path to report the real reason rather than a generic
message. The delete path is held to the same standard.

## Running the gate

```bash
npm run verify
```

`typecheck` → domain and component tests → pgTAP → Playwright. `test:db` goes
through `scripts/test-db.sh`, which checks the local stack is running and exits
with a one-line message if it is not; without that guard the Supabase CLI spins
indefinitely rather than reporting the problem.

---

# Traps this build hit

Each of these cost real time to find, and most of them fail *silently* — which is why
they are written down rather than left in a commit message.

### RLS and GRANT are two gates, and only one fails loudly

A role needs **both** a table privilege and a policy that admits it. They fail in
opposite directions, which is what makes this hard to diagnose:

| Missing | Symptom |
|---|---|
| `GRANT` | `permission denied for table topics` — loud, nothing works |
| policy | **zero rows, no error** — quiet, and it looks like the data vanished |

The local stack hides the first one. Supabase's default ACLs grant
`arwdDxtm` to `anon`, `authenticated` and `service_role` for every new table in
`public`, so a migration that creates a table and its policies appears complete. A
hosted project does not guarantee those defaults apply to a table a migration created,
and the app then fails on deploy with a permission error against a schema that passes
every local test.

That is exactly what happened here: phase 1 verified the default ACLs by probe and
relied on them, and `*_topics_grants.sql` was added later to make the privilege
explicit rather than inherited.

The lesson is narrower than "always grant": **test the gate you inherited, not just the
one you wrote.** Phase 1 asserted the policies exhaustively — cross-user isolation, anon
coverage, twenty assertions — and asserted the privileges not at all, so nothing local
could have caught it. `topics_test.sql` now checks all four privileges with
`has_table_privilege`. Revoking them fails 33 of its 63 assertions, because every RLS
test depends on `authenticated` being able to reach the table in the first place.

### `postgres` has BYPASSRLS

pgTAP runs as `postgres`, which on a Supabase stack bypasses row-level security on
**every** table, not just ones it owns. A policy test that forgets to switch role
passes whether or not the policy exists. Every RLS assertion sets both the role and
`request.jwt.claims`, and the suite was verified by disabling RLS and watching it go
red.

### `now()` is fixed for a whole transaction

An insert followed by an update inside one transaction produces *identical*
timestamps, so a naive `updated_at` trigger test passes with no trigger at all. The
test inserts a backdated row so the update has somewhere to move.

### A CHECK constraint does not imply NOT NULL

`check (difficulty in ('easy','medium','hard'))` evaluates to NULL — not false — for a
null value, and a row is rejected only on false. A null slipped through the very
constraint that looked like it was enumerating the legal values. A column default only
ever covers an *omitted* value, never an explicit null. **If a column enumerates its
legal values, it almost certainly wants NOT NULL too.**

### pgTAP overload resolution binds the wrong function

`col_type_is('public','topics','id','uuid')` silently binds to
`(table, column, type, description)` rather than `(schema, table, column, type)` — it
looks for a column literally named `topics`. The tell is failing test names echoing the
*type* string. Schema, table and column arguments need explicit `::name` casts.

### A clean `db reset` does not prove a migration did anything

A migration file left at 0 bytes by an interrupted write was applied without complaint
and its version recorded. The ledger said applied; the schema was unchanged. Verify
against `information_schema`, not against the `Applying migration …` line.

### `storage.protect_objects_delete` forbids SQL deletes

A storage object cannot be removed by SQL or by a trigger. The trigger is
`BEFORE DELETE FOR EACH STATEMENT`, so it fires even when RLS matches zero rows.
Deleting a topic is therefore a two-step application operation, object first — see
"Deleting a topic" above. Tests set `storage.allow_delete_query`, which is what the
Storage API itself does.

### Next 16 renamed `middleware` to `proxy`, and it must sit beside `app`

`middleware.ts` is deprecated. The convention file is `proxy.ts`, exporting `proxy`,
and it belongs at the same level as `app` — so `src/proxy.ts`, not the repository
root. A root-level file is **silently ignored**: the app builds, sign-in works, and
only the route guards quietly stop existing.

### `@supabase/ssr` 0.12.5 passes cache headers as a second argument

`setAll(cookiesToSet, headers)`. Ignoring the second parameter still typechecks. The
deprecated `get`/`set`/`remove` cookie methods cause, in the package's own words,
"random logouts, early session termination, JSON parsing errors".

### Randomness and clocks are impure during render

`Math.random()` and `Date.now()` in a render — on the server *or* inside a `useState`
initialiser — are rejected by the lint config, and rightly. `seededShuffle` takes its
seed from the `readAt` the data layer already returns, and relative times are relative
to the read rather than to whenever a component happened to render.

### Randomness must not go inside a sort comparator

It makes the comparator non-transitive, and `Array.prototype.sort` then becomes
implementation-defined — it can reorder across buckets entirely. Sort by a total order
first, then shuffle runs of exactly-equal keys.

### An unscoped count in a test is only correct while the table is empty

Two storage assertions counted objects across the whole bucket as `postgres`. They
passed for nine phases and broke the moment real uploads existed. Scope test counts to
the fixture's own rows.

### Supabase's local auth rate limit is not adjustable, and it looks like flakiness

`sign_in_sign_ups` defaults to **30 per five minutes per IP**. A suite that signs in
once per spec passes that in a single run. Past the limit every sign-in fails and the
browser simply sits on `/sign-in`, so whole spec files fail together, seemingly at
random, and pass when run alone.

Setting the value in `config.toml` does nothing: CLI 2.116 does not plumb it through —
the auth container exposes `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` and others, but nothing
for sign-ins. The fix is to sign in less: `e2e/global-setup.ts` signs each fixture user
in once and the specs replay the saved cookies, taking the suite from ~57 sign-ins a
run to four.

### One Supabase client per request, not per call site

`createClient()` in `src/lib/supabase/server.ts` is wrapped in React's `cache()`.
Without it, a single render built a separate client in the layout, in the data layer
and in each action. Refresh tokens are single-use, so two clients meeting the same
expired cookie both try to refresh, the second loses, and it returns **no user** — a
signed-in person's email rendering blank. It only appears under concurrent load.

The same reasoning removed two other auth round-trips: the image upload takes the user
id from the row the server just wrote rather than calling `getUser()` again, and the
rail reads the email from `getClaims()` — the token the proxy already verified — rather
than asking the auth server a second time.

### `role="alert"` is not unique

Next renders a route announcer with `role="alert"`. Any assertion on an alert has to be
scoped to the container it belongs to.

### The observed limit of the cache-header fix (since closed)

Verified by lowering `jwt_expiry` to 5s and driving a real refresh. `Set-Cookie` is
written, `Expires: 0` and `Pragma: no-cache` arrive intact — but `Cache-Control` reads
`no-cache, must-revalidate`, which is **Next's** value, not the package's
`private, no-cache, no-store, must-revalidate, max-age=0`. The response was still not
cacheable without revalidation, but `private` and `no-store` were absent.

**Closed by setting the header directly.** `next.config.ts` puts
`private, no-store, max-age=0, must-revalidate` on `/library`, `/practice`, `/weak` and
`/topic/*`. Every one of those renders one person's private data, so none of them should
ever sit in a cache that serves more than one person — the header is right on its own
merits, and it does not depend on a refresh having happened, which the package's version
did. `/sign-in` keeps its cacheable header: it holds nothing private.

### Custom email templates are fetched over HTTP, from inside the Docker network

The auth container does not read `supabase/templates/*.html` off disk. The CLI serves
them through Kong and gives GoTrue a URL, so a template failure looks like this in
`docker logs`:

```
templatemailer: template type "recovery": Get "http://supabase_kong_recall:8088/email/recovery.html": connection refused
```

Two consequences. Editing a template needs the stack running to take effect, and that
host:port is only resolvable *inside* the Docker network — curling it from the Mac
returns nothing, which is correct and not the fault. Diagnose from the container logs
and from whether the mail actually lands in Mailpit, never from the host.

### A client-side `Link` click returns before the page changes

Playwright's `.click()` on a `next/link` resolves as soon as the click lands, not when
the transition commits. Anything chained straight onto it runs against the *old* page.

This is worse than a plain race, because the locators frequently still match. Filling
`Email` immediately after clicking "Forgotten your password?" fills sign-in's own Email
field, which is then discarded when `/reset-password` mounts — so the form submits
empty, no request is made, and the failure surfaces much later as a missing heading with
nothing in any log to explain it. Server actions that redirect (`Sign out`) behave the
same way.

Follow every such click with `await expect(page).toHaveURL(…)`. The wait is the
assertion that the navigation happened, so it is worth having on its own merits.

### `defaultValue` alone cannot refill a field after a Server Action

React resets an uncontrolled form once its action resolves. That is usually what you
want — but it means a rejected sign-in clears the email along with the password, so one
mistyped character costs two fields.

Echoing the address back in the action's state is only half the fix. `defaultValue` is
applied on **mount**, and the reset restores the value the input was mounted with, so a
re-render carrying the new default produces a field with the right prop and the wrong
value. The input has to be remounted, which is what `key={state.email ?? ''}` on the
sign-in and sign-up email fields is for.

The password is never echoed back, and there is no spec for the sign-up half: its error
path cannot be provoked from a browser. A short password stops at `minlength`, an
address that already exists returns success rather than an error (Supabase does not
confirm which addresses are registered), and GoTrue accepts anything the browser's
`type="email"` accepts. The path is real — "Error sending confirmation email" arrives
through it — it just is not reachable from a test.

### Running `playwright test` directly tests the last build, not your edit

`webServer` runs `npm run start`, deliberately (see `playwright.config.ts` for why). The
`test:e2e` script builds first; `npx playwright test` does not. Editing a component and
running Playwright straight afterwards silently exercises stale output, and the failure
looks like a broken fix rather than a stale one. Build first, or go through `npm run
verify`.

## Two ways to read the library

`listTopics` used to read every topic the user owned, and `filterTopics` narrowed the
result in the browser. That is fine at a few hundred topics and unusable at twenty
thousand — issue #4, and not hypothetical: the e2e fixture user reached 288 topics
during the build and the library got slow enough to blow a 15s test timeout.

`src/lib/data/library.ts` now picks between two modes:

- **local** — the whole library, filtered and counted in the browser by the domain
  functions. Identical to the old behaviour, including instant round-trip-free search.
- **server** — one keyset page and a counts object, both from SQL.

The choice is made by size alone. An unfiltered first read asks for `LOCAL_MODE_MAX + 1`
rows; getting fewer back proves the whole library is in hand.

### Why the modes cannot be mixed

Phase 7 established that a toolbar count and the list it describes come from the same
`filterTopics` call, so a filter reading 12 cannot yield 11 rows. A hybrid is precisely
where that guarantee would be lost — a locally filtered list beside a SQL-derived count.

So `LibraryData` is a discriminated union where `local` carries no counts and `server`
carries no unfiltered array. Neither shape contains both halves, so pairing rows from
one mode with counts from the other is a **compile error**, not a rule to remember. In
the component the two are chosen in a single expression with one branch.

### SQL replaces counting, and nothing else

`categoryOptions` orders by count and breaks ties with `localeCompare`, which a database
collation will not reproduce. So `library_counts` returns raw integers and the
`*FromCounts` functions in `src/lib/domain/library.ts` do all sorting and labelling.
Both modes run that same code; only the counting differs. It keeps the surface SQL has
to agree about as small as it can be.

The rail is the same idea taken further. Its "N queued" is
`min(total, PRACTICE_SESSION_SIZE)`, because `selectPracticeSession` orders the whole
library and takes the first N — so the *length* never depended on the ordering. Counting
rows is enough, and none of the bucket ordering or shuffling exists in SQL.
`practiceQueueSize` is asserted equal to `selectPracticeSession(...).length` for
arbitrary libraries.

### The parity harness

Two implementations of one specification is the arrangement that drifts, so neither is
trusted. `src/lib/domain/__fixtures__/library-corpus.ts` holds one corpus and 53 filter
combinations; the domain is run over it and the results are written into
`supabase/tests/library_parity_test.sql` as literal expectations.

- **pgTAP** asserts the two RPCs reproduce those rows and counts exactly.
- **Vitest** asserts the committed file is still what the domain produces. Without this
  half, changing a domain rule would leave SQL agreeing with a stale specification and
  both layers green.

Together: domain == committed expectations == SQL. Both halves were deliberately broken
to confirm they fail — dropping tags from `topic_search_text` fails the pgTAP row *and*
count assertions; changing `RECENT_WINDOW_DAYS` fails the Vitest one.

The corpus exists to be hostile: NBSP, thin, ideographic and narrow spaces, line
separator, vertical tab, form feed, zero-width space (whitespace to neither engine),
Turkish dotted capital I, Greek final sigma, the sharp s, all three LIKE
metacharacters, and a title whose end meets the next field's beginning so a needle
spanning two fields must not match.

### Matching in SQL, and what it depends on

`matchesQuery` tests each field separately, so `topic_search_text` joins the normalised
fields with a newline. Each field's own newlines are already collapsed to spaces by the
normaliser, so the only newlines are separators, and a normalised needle can never
contain one — which is what makes a cross-field match impossible.

`normaliseText`'s counterpart is
`lower(regexp_replace(btrim(coalesce(x,'')), '\s+', ' ', 'g'))`. The two were verified
equal across all of the hostile cases above, on both the local stack and the hosted
project: PostgreSQL 17.6, `en_US.UTF-8`, ICU provider, zero divergences out of 18.

**That equality depends on the collation and locale provider matching.** If they ever
diverge, local and server mode can disagree in production while every local test passes.
Check `datcollate`, `datctype` and `datlocprovider` before moving to a different
database.

### `IMMUTABLE` on `topic_search_text` is a deliberate claim

A `GENERATED ... STORED` column requires an immutable expression, and `array_to_string`
and `concat_ws` are marked STABLE — Postgres rejects the column outright. The wrapper
function declares itself `IMMUTABLE`, which is slightly stronger than Postgres's own
labelling: those functions are STABLE only because output functions for arbitrary
element types may not be immutable, and for `text[]` the result is deterministic.

### A trigram index needs three characters

`search_text` carries a GIN `gin_trgm_ops` index, which the planner uses for
`LIKE '%needle%'` once the table is big enough — at 50,000 rows it chose the index
unprompted and returned in 2ms. A needle of one or two characters produces no trigram
and falls back to a scan, bounded by one user's rows under RLS. That is a real limit,
not a bug to be surprised by later.

### There is deliberately no GIN index on `tags`

Tags are searched, not filtered. `matchesQuery` treats each tag as one more field to
match a substring against, so `topic_search_text` folds them into `search_text` and the
trigram index serves them like any other field. There is no `tags @> ARRAY[...]` anywhere,
and no tag filter in `TopicFilters` or the UI — a tag appears in the editing input and as
decoration in a card's path line, and that is all.

Issue #5 proposed `create index topics_tags_idx on public.topics using gin (tags)` on the
reasoning that it would be needed once filtering moved into SQL. Filtering did move, in
#4, but through the trigram index rather than array containment, so the index would index
a column no query filters on. Measured at 50,000 rows, the plan for a tag search is
byte-identical with and without it — the same `Bitmap Index Scan on
topics_search_text_trgm_idx` either way.

**What would change this**: an exact tag filter. `tags @> ARRAY['react']` is a different
query shape that the trigram index cannot serve, and a GIN index on `tags` is exactly what
it needs. The index should arrive with that feature, not ahead of it — an index no query
uses tends to survive for years because nobody can prove it is safe to drop.

## The practice ordering, in SQL

Issue #12. The weak page and the practice page both read every topic the user owned and
ordered them in the browser with `orderForPractice`. Confidence starts at `new` and
`needsReview` is `weak or new`, so a freshly imported library is **entirely** weak — the
weak page loaded all of it, and the practice page loaded all of it to pick ten.

`public.practice_ordered_page` holds the ordering once and serves both, differing only in
whether a seed is passed:

- **The weak page** passes none. The tie-break term is null for every row and the order
  falls through to `created_at desc, id desc`, which is what `noShuffle` produced over
  `listTopics`' ordering. Stable across reloads, which a list page has to be.
- **A practice session** passes the read timestamp, so ties are shuffled, and asks for
  `PRACTICE_SESSION_SIZE` rows.

`NEVER` is `-Infinity` in the domain and `timestamptz` has `'-infinity'`, so
`coalesce(last_practiced_at, '-infinity')` is an exact counterpart — and it makes the
keyset cursor a plain comparison instead of null-juggling.

### An md5 tie-break is the specification, not a relaxation of it

`Shuffle` has been an injected parameter since phase 2:
`selectPracticeSession(topics, { shuffle })`. The domain specifies **that** ties are
broken, never **which** permutation — `noShuffle` and `seededShuffle` are already two
implementations of it. `md5(seed || id)` is a third: deterministic, seeded from the read,
uniform across a tie group.

This matters for how the next section reads. Practice-selection parity is property-based
rather than id-for-id, and that is **not** a weaker guarantee accepted under duress — it
is the injection point being used for exactly what it exists for. A second implementation
of an injectable rule cannot be checked by comparing it to the first; it is checked
against the rule.

### Parity: id-for-id where the query is deterministic, properties where it is not

The **unseeded** ordering is deterministic, so pgTAP asserts it equals
`orderForPractice(topics.filter(needsReview), { shuffle: noShuffle })` id for id, from the
same corpus and the same generator as #4.

The **seeded** selection is asserted through nine properties in
`supabase/tests/practice_ordering_test.sql`: bucket order, staleness within a bucket,
never-practised sorting first rather than tying, same seed same session, different seed
different session, every tie-group member reachable, no member dominating, and the session
size at both ends of the cap.

Since there is no id-for-id backstop underneath them, each property was shown failing
against a deliberately perturbed ordering before being accepted. That pass caught a real
hole: with only three weak topics carrying distinct stamps, dropping staleness from the
ordering still ran green, because a wrong order of three rows has a fair chance of
matching the right one. The fixture now carries twelve.

### What this bounds, and what it does not

Measured on a synthetic 20,000-topic library, all `new` and never practised — one tie
group containing everything:

```
Limit (actual rows=10)
  ->  Sort  Sort Method: top-N heapsort  Memory: 27kB
        ->  Seq Scan on topics (actual rows=20000)
Execution Time: 24.650 ms
```

**Rows read: 20,000. Rows returned: 10.** The `LIMIT` does not bound the scan, and it
cannot: selecting ten uniformly from a tie group of twenty thousand has to touch twenty
thousand rows somewhere, and `md5(seed || id)` changes per seed so no index can serve it.

What changed is *where* that happens. It used to be twenty thousand rows crossing the wire
and being parsed into objects in Node; it is now a sequential scan and a 27kB heap inside
Postgres, with ten rows crossing the wire. The pathology was never the scan.

### `orderForPractice` is now specification, not dead code

Production no longer calls `orderForPractice` or `selectPracticeSession` — SQL does the
ordering. They stay because they are what that SQL is checked against, and `BUCKET_ORDER`
stays as the single definition of bucket order, passed into the query as `BUCKET_SEQUENCE`
so a database function cannot hold a stale copy of it.

### There is no longer a "read every topic" function

`listTopics` is gone. Every caller now has a purpose-built query: a keyset page for the
library, an ordered page for the weak list and a practice session, and counts for the rail,
the toolbar and the category select. It was removed rather than left in place because it
was the easy thing to reach for, and reaching for it is what put an unbounded read on five
pages.

## Production configuration is in the repo

`supabase/config.toml` ends with a `[remotes.production]` block. Everything above it
configures the local stack; that block overrides it for the hosted project, and
`supabase config push` applies the result.

It exists because production auth settings used to live only in the dashboard, and that
cost two debugging sessions inside a week: sign-ups left switched off after email
confirmation shipped, and an unverified Resend sender that failed every auth email with a
550. Neither was reviewable in a diff, and neither would have survived recreating the
project.

### `config push` sends the merged config, not the overrides

A field the remote block does not name does **not** keep its dashboard value — it gets the
local one. That is the whole reason the block restates fields that look redundant.

The local values that must never reach production are the ones raised for the test suite:
`email_sent = 1000` an hour would burn a month of Resend's free tier in an afternoon, and
`max_frequency = "1s"` removes the guard against using sign-up as a mail cannon. Both are
overridden; so is `token_refresh`, raised for the same reason.

### A mistyped `project_id` silently applies nothing

Remotes are matched by `project_id` against the linked ref. If it does not match, the CLI
does not warn — it applies no override at all and pushes the local values. Confirmed by
setting a wrong ref: no error, no override.

So the confirmation is the line the CLI prints:

```
Loading config override: [remotes.production]
```

If that line is absent, the block did not apply. It does validate what it parses — two
remotes sharing a `project_id` is a hard error — but a ref matching nothing is not.

### SMTP is declared explicitly, on purpose

`v1UpdateAuthServiceConfig` is a `PATCH`, so fields absent from the body are not cleared.
But whether the CLI *omits* SMTP when the local config has no `[auth.email.smtp]` block,
or sends it empty, decides whether a push wipes the dashboard's SMTP settings and silently
breaks every auth email. That could not be determined without pushing and finding out.

Naming the SMTP fields in the remote block makes the question moot: the push sets them to
the right values either way.

The password is not in the repo. It is `env(SUPABASE_AUTH_SMTP_PASSWORD)`, exported at
push time:

```
export SUPABASE_AUTH_SMTP_PASSWORD='<the Resend API key>'
supabase config push
```

### How to check a push landed — and how not to

`supabase config push` reading back **`Remote Auth config is up to date`** is the check.
It compares the stored config through the Management API, which is the only thing that
actually knows.

Do not try to infer it from the outside. `additional_redirect_urls` in particular looks
testable through `/auth/v1/verify?...&redirect_to=`, and is not: that endpoint honours a
`redirect_to` whose host matches **`site_url`** and falls back otherwise, so every URL on
the site_url host appears to work and every other URL appears to be rejected, whatever the
allow-list contains. Reading it as an allow-list probe reports a failure that is not there,
twice, convincingly.

The one thing no external probe can answer is what is in the redirect allow-list. That is
a dashboard read, or a `config push` that reports no diff.

### `minimum_password_length` was 6 and the form said 8

The sign-up form asks for eight characters and enforces it with `minlength`, while the
config allowed six — so the server would have accepted a password the UI refused. Settled
at 8 in both local and production rather than left disagreeing.

## Navigation felt slow, and it was not the database

Reported after the app had real content in it. Measured before changing anything:
the rail's count query runs in **0.188 ms** against a real account, Vercel serves from
`bom1` and Supabase lives in `ap-south-1` — the same region — and unauthenticated
responses return in 130–200 ms.

The cause was that only `/library` had a `loading.tsx`. Next holds the **previous** page
on screen for the whole server render, so clicking "Weak topics" looked like nothing had
happened until the page swapped. `/weak`, `/practice` and `/topic/[id]` now have loading
boundaries whose geometry matches the real content.

The rail's three separate count requests became one `rail_counts` RPC at the same time.
Three round trips per navigation is not what made it feel slow, but it was three round
trips for one number each.

**The lesson is that "slow" was a rendering-feedback problem wearing a performance
costume.** Every measurement pointed away from the thing that was actually wrong.

### The rail advertised three shortcuts that did not exist

`N`, `/` and `P` were rendered as `Kbd` hints from phase 4 onward and nothing implemented
them. They came from `design-reference.html`, which is exactly the trap DESIGN.md names
for the mock's other decoration — the rule it illustrates is real, the values are not.

They are implemented now, in `components/topics/global-keys.tsx`, mounted once in the
`(app)` layout. Not in the practice group: a session has its own keys and `P` there means
nothing.

`isTyping` moved to `components/ui/is-typing.ts` and is shared with the practice keys. Two
handlers deciding separately whether a keystroke belongs to a field is how one of them
ends up grading a card while someone types the word "three".

A client shortcut does not exist until React hydrates, so a keystroke immediately after
load is genuinely ignored. The spec retries with `toPass` rather than asserting against
that race.

### A programmatic scroll right after a navigation is silently undone

Next restores scroll position once a navigation settles. A `window.scrollTo` issued
before that lands is reverted, `scrollY` reads 0, and an assertion like "the rail is
still visible after scrolling" passes — because nothing scrolled and the rail never
left the viewport.

This is the same shape as the storage assertions that only passed while the bucket was
empty: a test that is green for a reason unrelated to the thing it claims to check. It
cost three rounds before the scroll was instrumented rather than assumed.

Scroll by pulling the target into view — `locator.scrollIntoViewIfNeeded()` — which
waits for the page rather than racing it, and is also faster. Verified by un-stickying
the rail and confirming the assertion then fails with `viewport ratio 0`.

## Environmental notes

Not traps in the code — things about the machine that present as code failures.

### Container clock drift shows up as `PGRST303 · JWT issued at future`

The local stack's containers can drift apart by a second or so, typically after the host
sleeps. `supabase_auth_recall` running ahead of `supabase_rest_recall` is enough:
PostgREST allows no leeway on a JWT's `iat`, so a token minted a moment ago looks
future-dated and the request fails.

It presents as random 500s from reads that were fine a minute earlier —
`Loading your topics failed: PGRST303`. Compare the container clocks:

```bash
for c in $(docker ps --format '{{.Names}}' | grep supabase); do
  printf '%-28s %s\n' "$c" "$(docker exec "$c" date -u +%FT%TZ)"
done
```

`supabase stop && supabase start` resyncs them. Nothing in the application is wrong when
this happens, which is exactly why it is worth recognising quickly.

### DESIGN.md rules are referenced by name, not number

`DESIGN.md, "Accessibility floor"` and `DESIGN.md, "Delete confirmation names what
dies"` — never `section 6` or `section 4.8`.

The rules in section 4 are a numbered list, so inserting one renumbers every rule
after it, and every reference to those rules across the codebase. That happened four
times — the mobile-tab-bar rule alone moved from 4.8 to 4.9 to 4.10 to 4.11 to 4.12,
dragging code comments with it each time — before the numbers were dropped.

The bolded phrase opening each rule is its name, and each name used as a reference is
unique in the file, so a grep finds the rule. `TASKS.md` still carries numeric
references and is deliberately left alone: it is the historical record of the twelve
phases and says so, and its references describe what those numbers were at the time.

### A `md:hidden` child inside a `md:`-only container is visible at no width

The account foot in the app rail holds Settings and Sign out, so "put Sources beside
Settings in the account foot" sounded like it named a surface that exists on a phone. It
does not. The whole `<aside>` is `hidden … md:flex`, so below `--breakpoint-md` the foot is
`display: none` and a link inside it carrying `md:hidden` renders at **no width at all** —
hidden below the breakpoint by its parent, hidden above it by itself.

The mobile account surface is a separate `md:hidden` cluster in the library head
(`library-view.tsx`), which is where Settings and Sign out actually live on a phone. The
rail's copies are the desktop pair.

Two things follow. First, "where does X live on mobile" is a question about the rendered
tree, not about the component whose name matches: a comment claiming a mobile route is not
evidence of one. Second, the Playwright failure was the honest signal and the temptation
was to weaken the test — the assertion was right and the implementation was wrong.

The general form is worth keeping: **responsive utilities compose by intersection, not by
override.** A child cannot reveal itself inside a hidden parent, so a breakpoint-scoped
class on a child is only ever a further restriction of the parent's range.

### A count assertion stops meaning what it says as soon as a surface grows

`settings.spec.ts` asserted the rail nav held exactly three links, commented "a fourth
would break the mobile tab bar's shape". The rule it was protecting is about the mobile
tab bar; the rail is a different surface, and giving it an Apprenticeship group turned a
true assertion into a false one without the rule changing at all.

Rewritten to name the three destinations and assert Settings is not among them — which is
what the sentence meant, and which the mobile half of the same file had already worked out
for itself: *"counting links would read 3 and mean nothing. The invariant is which
destinations are there."*

### A new table needs an explicit GRANT, and no local test can tell you it is missing

`sources` shipped with four RLS policies and no grant. Every local check passed —
42 pgTAP assertions, the full e2e suite against a real Supabase — and the hosted
project answered `42501 · permission denied for table sources`. It took down every
page in the (app) group rather than only `/sources`, because `countSources()` runs
in the shared layout.

This is the second time. `20260828052220_topics_grants.sql` exists for exactly this
and says so in its own comment; the lesson had been recorded and was still repeated,
because nothing enforced it.

The trap is that **the local stack cannot answer the question.** Supabase grants new
tables in `public` through default ACLs locally, so `has_table_privilege` passes
whether or not the grant migration exists. A hosted project does not apply those
defaults to a table created by a migration on a running project. A test that reads
the database is therefore structurally incapable of catching this — which is why
`topics_test.sql`'s privilege assertions, which look like the guard, never were one.
They catch a fresh database, not a forgotten migration.

So the guard reads the **migrations**: `src/lib/data/table-grants.test.ts` extracts
every `create table public.x` and asserts a matching `grant … to authenticated`.
Proven by deleting the grant migration and watching it name all four privileges.

The general form: when local and production differ in a *default*, no amount of
testing against local proves anything about production. The assertion has to move to
the artefact that is identical in both — here, the SQL itself.

### RLS and GRANT fail in opposite directions, which is why the loud one hides

Recorded under topics and worth restating with a second instance behind it. Without
the GRANT you get a 500 naming the table. Without the policy you get zero rows and no
error, which reads like the data vanished. The loud failure is the safe one, and the
temptation after fixing it is to assume the quiet gate was also exercised — it was
not. Here the policies were correct throughout and completely irrelevant, because
GRANT is checked first and nothing ever reached them.
