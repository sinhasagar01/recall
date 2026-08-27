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
a topic. Confidence wins because DESIGN.md §2 labels the confidence value `new` as
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
filtered view is shareable and survives a reload, at no server round-trip and with no
history entry per keystroke.

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

`src/components/ui` holds the primitives from DESIGN.md section 2. Nothing in there
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
are application-level sequences with partial-failure states, and DESIGN.md §4.4
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

### The observed limit of the cache-header fix

Verified by lowering `jwt_expiry` to 5s and driving a real refresh. `Set-Cookie` is
written, `Expires: 0` and `Pragma: no-cache` arrive intact — but `Cache-Control` reads
`no-cache, must-revalidate`, which is **Next's** value, not the package's
`private, no-cache, no-store, must-revalidate, max-age=0`. The response is still not
cacheable without revalidation, but `private` and `no-store` are absent. Recorded as a
known gap rather than fought.
