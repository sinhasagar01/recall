# Tasks

One checklist per phase. Updated as work happens, not at the end.

## Environment

| | |
|---|---|
| Next.js | 16.3.3 (App Router, `src/`) |
| React / react-dom | 19.2.8 |
| Tailwind CSS | **4.3.3 — major version 4** |
| TypeScript | 5.9.3, `strict: true` |
| Vitest | 4.1.11 |
| Playwright | 1.62.1 |
| Supabase CLI | 2.116.0 (Docker 29.7.2, Postgres 17) |

**Tailwind is v4, not v3.** That means CSS-first configuration: no
`tailwind.config.js`, no `content` array. Tokens go in `src/app/globals.css`
inside an `@theme` block, and PostCSS uses `@tailwindcss/postcss`. Any v3-shaped
advice (JS config, `theme.extend`) does not apply here.

**Env var names**, read from `.env.local`, mirrored in `.env.example`:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. This CLI
version no longer emits `anon` / `service_role` keys, so there is no
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. A secret key must never take a `NEXT_PUBLIC_`
prefix.

---

## Phase 0 — tooling

- [x] Recover the missing `supabase/config.toml` (`supabase init`) and commit it
- [x] Restart the local stack so the containers come from the committed config
- [x] `.gitignore`: un-ignore `.env.example`, ignore Playwright artifacts, untrack `.DS_Store`
- [x] Vitest with two projects — `domain` (node) and `components` (jsdom)
- [x] Vitest smoke tests, red before green, in both projects
- [x] Playwright configured against `next dev`, with a smoke spec
- [x] pgTAP: `supabase test new`, one trivially passing test, `supabase test db` confirmed working
- [x] `scripts/test-db.sh` guards against a stopped stack
- [x] Scripts: `typecheck`, `test`, `test:watch`, `test:db`, `test:e2e`, `verify`
- [x] `.env.example` mirroring `.env.local`
- [x] `TASKS.md`, `ARCHITECTURE.md`, `README.md` skeleton

## Phase 1 — schema, RLS, storage

- [x] pgTAP tests for the `topics` columns, defaults and check constraints — **written first**
- [x] pgTAP tests for the `updated_at` trigger
- [x] pgTAP RLS tests: two users, user B can neither read nor write user A's rows
- [x] pgTAP storage tests: user B cannot read or write user A's objects
- [x] Migration: `topics` table, trigger, indexes on `(user_id, created_at desc)` and `(user_id, confidence)`
- [x] Migration: RLS policies. `user_id` defaults to `auth.uid()`; clients never send it
- [x] Migration: private `mental-models` bucket + policies on `(storage.foldername(name))[1]`
- [x] Signed-out (`anon`) coverage on both tables: select, insert, update, delete
- [x] Enforcement verified: tests go red with RLS off, policies unkeyed, or opened to anon
- [x] `db:types` script added, deliberately not run and not wired into `verify`
- [x] Follow-up migration `*_topics_not_null.sql`: difficulty, confidence and tags
      were missing NOT NULL. A CHECK passes on NULL, so an explicit null insert
      succeeded. Written up in ARCHITECTURE.md, "A CHECK constraint does not imply NOT NULL"

### Things this phase discovered, worth not rediscovering

**`postgres` has `BYPASSRLS` on this stack** (it is not a superuser, but it bypasses
anyway). pgTAP runs as `postgres`, so *every* RLS assertion is vacuous unless the test
switches role. `tests_login_as()` sets both `role` and `request.jwt.claims`; the helpers
live inside each test file's transaction and are rolled back, so nothing test-only ships.

**`now()` is fixed for a whole transaction.** An insert followed by an update in the same
transaction produces identical timestamps, so a naive `updated_at` trigger test passes
with no trigger at all. The test inserts a backdated row so the update has somewhere to
move. The trigger is `BEFORE UPDATE` only, which is what lets an insert carry explicit
timestamps.

**pgTAP overload resolution.** `col_type_is('public','topics','id','uuid')` silently binds
to `(table, column, type, description)`, not `(schema, table, column, type)` — it looks for
a column literally named `topics`. Schema/table/column arguments need explicit `::name`
casts.

**Data-modifying CTEs cannot sit in a subquery**, so "affected 0 rows" is measured with a
`SECURITY INVOKER` helper using `GET DIAGNOSTICS`. Invoker rights are the point: the
statement must run as the logged-in user so RLS applies.

**Direct SQL deletes from `storage.objects` are blocked** by a statement-level trigger. This
is a binding architectural constraint, not a test detail — it is written up in
ARCHITECTURE.md, "Binding constraint: deleting a mental-model image". The storage test sets
the `storage.allow_delete_query` setting the Storage API sets. It is a custom parameter, not
a privilege, so RLS stays in force.

## Phase 2 — domain layer

- [x] `types.ts` — `Topic` hand-written against the migration, not generated. No
      nullable `difficulty`/`confidence`/`tags`, and no normalising helpers: the
      schema was fixed instead of worked around
- [x] `practice-selection.ts` — never-practiced, then weak, okay and strong each by longest gap, ties to an injected shuffle. Session size 10, or everything if fewer
- [x] Practice minimum of 3 topics, with `canPracticeBelowMinimum` as the override path
- [x] `search-filter.ts` — partial, case-insensitive, across title, definition, mental_model, category, tags. `"recon"` finds `"React reconciliation"`. Filters compose with AND
- [x] `confidence.ts` — didn't know → weak, partly → okay, knew it → strong; each increments `practice_count` and sets `last_practiced_at`. Skip returns null
- [x] `category-suggest.ts` — keyword heuristic over title and definition. No AI API
- [x] Every one of the above unit tested first, no UI (99 tests)
- [x] `isNeverPracticed` is one predicate with two callers; `RECENT_WINDOW_DAYS` is one constant with two callers

### Decisions recorded in ARCHITECTURE.md

Why `Topic` is hand-written rather than generated · what "never practiced" means and
why it keys on confidence · why `selectPracticeSession` takes no clock · why the
shuffle never goes inside the sort comparator.

## Phase 3 — auth

- [x] `src/lib/supabase/{client,server,middleware}.ts` via `@supabase/ssr` 0.12.5
- [x] `src/proxy.ts` refreshes the session cookie and guards `/library`, `/topic`, `/practice`, `/weak`
- [x] Sign in and sign up screens (email + password only), matching the mock's copy and states
- [x] Sign out, at the foot of the rail where the mock puts it
- [x] Token layer: DESIGN.md section 1 in an `@theme` block, Tailwind v4, no `tailwind.config.js`
- [x] `scripts/seed-e2e-user.mts` — deterministic, idempotent, safe to re-run. `test:e2e` runs it first
- [x] 7 Playwright specs, including the reload-keeps-the-session case explicitly

### What phase 4 must extract from the auth screens

Sign-in and sign-up were built with local markup on purpose — the shared primitives are
phase 4. Both screens currently duplicate:

- **Button** — primary/block/large variant, the disabled state, and the spinner-plus-label
  submitting state (`Create account` → `Creating account…`)
- **Field** — label, optional mono hint, input, and the error row with its icon,
  `aria-invalid` and `aria-describedby` wiring
- **Wordmark** — name plus accent dot, at two sizes (20px in the rail, 30px on auth)
- **The auth card shell** — mark, tagline, bordered box, alternate-action line

The error message string lives in `src/app/(auth)/actions.ts`. When Field is extracted,
the copy stays there rather than moving into the component.

The rail in `src/app/(app)/layout.tsx` is a stub: wordmark and sign out only. Phase 5 adds
the nav with counts and the `+ Add topic` button.

### Known gap — verified manually in phase 11, not automated

The `headers` argument that `setAll` receives in @supabase/ssr 0.12.5 is wired, but no test
asserts it. It only fires when the session is genuinely refreshed, and the local JWT lives
an hour (`jwt_expiry = 3600`), so no e2e run inside that window triggers it. Probed: on a
normal navigation with a valid session, no `Set-Cookie` is written at all — so nothing is
being dropped.

Automating it would mean permanently lowering `jwt_expiry`, which would force constant
refreshes in ordinary development. It is a **phase 11 manual check** instead:

1. Lower `jwt_expiry` in `supabase/config.toml` to a few seconds
2. `supabase stop && supabase start`
3. Run the reload spec and wait past the expiry so a refresh actually happens
4. Confirm the response carries `Set-Cookie` **and** the cache headers
   (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`,
   `Expires: 0`, `Pragma: no-cache`)
5. Restore `config.toml` and restart the stack

Do not lower `jwt_expiry` before phase 11.

## Phase 4 — UI primitives

- [x] ConfidenceMeter (fill count, not hue; `Never practiced` / `Weak` / `Okay` / `Strong`)
- [x] Select (listbox: trigger + popover, counts, grouping, filtering, full keyboard support)
- [x] The two registers — Definition and MentalModel
- [x] Button (primary/secondary/ghost/danger/danger-quiet, two sizes, loading, disabled)
- [x] Field, Wordmark, AuthCard — extracted from the phase 3 auth screens
- [x] Chip + QuickFilterChip, Skeleton, Toast, Sheet, Modal, Scrim, useFocusTrap
- [x] 41 interaction-model tests: Select keyboard/selection/filtering/focus return,
      Sheet and Modal trap/restore/Escape/scrim, ConfidenceMeter states and labels
- [x] Auth pages and the rail refactored onto the primitives; the phase 3 Playwright
      specs pass unchanged, which is the proof the refactor lost nothing
- [x] Token layer extended: `--breakpoint-md: 860px` to match the reference, the mono
      scale, `--text-option`, and the skeleton pulse keyframes

### Deliberately not built

No test for Chip, Skeleton, Wordmark, Button, Field, Toast or the registers — they are
presentational and have no interaction model, which is the layer-2 boundary in
ARCHITECTURE.md.

`.kbd` exists in the reference but is not in DESIGN.md's component list, so it is
inlined in Select's footer rather than shipped as an unlisted primitive. Phase 5 can
extract it if the rail's keyboard hints need it.

### For phase 5

The rail in `src/app/(app)/layout.tsx` still has only the wordmark and sign out. It
needs the nav with counts, the `+ Add topic` button and the keyboard hints.

## Phase 5 — library and add topic

- [x] `db:types` generated and committed; row → domain mapping with a compile-time
      divergence assertion (`TopicBoundaryIsSound`)
- [x] `src/lib/data/topics.ts` — the only module reading or writing topics
- [x] App shell: rail with three destinations, live counts, wordmark, add button,
      keyboard hints, signed-in identity, sign out
- [x] Library: loaded, loading skeleton, empty, load error
- [x] Recently learned section, reusing the phase 2 `recently-added` filter
- [x] Add topic: sheet, category Select with suggestions, tags, difficulty,
      saving state, success toast, list updates without a reload
- [x] The three-step insert → upload → patch seam, built before upload exists
- [x] Toolbar rendered but genuinely disabled, with a visible note

### Deliberate gaps, for later phases

- **The topic card is an `<article>`, not a link.** There is no detail route until
  phase 6, and a button that does nothing is worse than a card that does not claim to
  be interactive. Phase 6 makes it a link to `/topic/[id]`.
- **The rail's Practice and Weak topics entries are `aria-disabled` spans**, not links,
  for the same reason. Phases 8 and 9 make them links.
- **The toolbar is inert.** Phase 7 wires it to `search-filter.ts`.
- **The dropzone renders and says so.** Phase 10 slots the upload into the marked seam
  in `(app)/library/actions.ts`.

### Test isolation

A second seeded user, `E2E_EMPTY_USER_*`, that no spec ever writes to; the seed clears
its topics on every run, so leftovers cannot defeat the empty-library spec. Add-topic
specs use the main user and assert on a unique title they generate, never on a global
count — so the four Playwright workers stay independent and no database reset is
needed.

## Working rule — end-to-end tests are written first

Playwright specs are **written and run red before the page exists**. Selectors start
deliberately rough and are tightened once the DOM lands; the point of the red run is
that the feature is genuinely absent, not that the assertions are already perfect.

**A retroactive red run is not evidence of test-first and must not be presented as
one.** Phase 5 wrote its Playwright specs after the pages. The red run still caught two
real bugs, but it proved nothing about the order of work, and saying otherwise would
have been a false claim about the process. This rule binds every later phase.

## Phase 6 — topic detail

- [x] `/topic/[id]` as a server component: breadcrumb, title, chips, difficulty,
      the two registers, Visual, Recall history, action bar
- [x] The card converted from `<article>` to a link to the detail route
- [x] Edit through the SAME sheet in a second mode — `TopicSheet`, not a fork
- [x] Delete confirmation naming what actually dies, built from what the topic holds
- [x] Lightbox on the phase 4 focus trap — one trap in the codebase, not two
- [x] Not-found and another user's topic render identically, asserted end to end
- [x] 7 Playwright specs, written and run red before the pages existed

### Deferred conversions — updated

- ~~The topic card is an `<article>`~~ — **done**, it is now a link to `/topic/[id]`.
- **"Practice this" on the detail action bar is disabled**, like the rail's Practice
  entry. Phase 8 wires both.
- The rail's Practice and Weak topics entries are still `aria-disabled` spans.
- The toolbar is still inert; phase 7 wires it.
- **The Visual section and the Lightbox are unreachable through the UI.** Nothing can
  set `mental_model_image_path` until phase 10, so the section never renders today.
  Playwright asserts its absence; a jsdom test drives the Lightbox directly. Phase 10
  adds the signed-URL read and the section becomes reachable.

### Where the delete-order seam is

`(app)/topic/[id]/actions.ts`, marked in `deleteTopic` ahead of `deleteTopicRow`. See
ARCHITECTURE.md, "Deleting a topic: the object goes first".

### Test isolation, continued

Every spec creates its own uniquely-titled topic and touches only that, so the delete
spec cannot race the others: it deletes a row no other spec knows about. The empty
user is still never written to — the ownership spec signs in as them only to read.

## Phase 7 — search and filters

- [x] Toolbar enabled: search, three Selects with real counts, three quick-filter chips, Clear
- [x] Wired to the phase 2 functions; no rules re-implemented in components
- [x] No-results state, distinct from the empty library, offering `Search all N topics`
      and `+ Add "<query>"` which opens the sheet prefilled
- [x] Filter state in the URL via `window.history.replaceState` — shareable, reload-safe,
      no history entry per keystroke
- [x] 8 Playwright specs, written and run red before the wiring existed

### Decisions

- **Counts: full library**, not the filtered set. The reference shows "All categories 48"
  while a query matching nothing is active.
- **Chips carry counts** rather than being disabled at zero. "Recently added 0" explains
  itself; a disabled chip only says no. With a 7-day window that case is common.
- **Search-term highlighting: skipped.** DESIGN.md section 7 lists it as deferred, and it
  is not free — it needs a match-splitting function and its own tests.

### New domain functions, and why phase 2 did not have them

`categoryOf` plus a fix to `filterTopics` so "Uncategorized" is selectable — see
ARCHITECTURE.md, "The gap phase 2 could not have seen". `confidenceOptions` and
`difficultyOptions` exist because the Selects need per-option counts and counting in a
component would be a comparison in a component; both delegate to `filterTopics`, so they
add no matching logic.

`CONFIDENCE_LABEL` moved from `confidence-meter.tsx` into `src/lib/domain/confidence.ts`.
Wiring the confidence select would otherwise have produced a second copy of the label map,
and the meter and the filter would have been free to disagree about the word for `new`.

## Phase 8 — practice

- [x] Recall · reveal + grade · session complete · too few topics (with override)
- [x] Grades persist per answer, not at session end — the write is awaited before advancing
- [x] Grade buttons reachable by `1` / `2` / `3`; Space reveals; all inert while typing
- [x] Skip writes nothing — there is no skip action to call
- [x] The typed answer is ephemeral, in component state only
- [x] `/practice` in its own route group, no rail
- [x] 6 Playwright specs, written and run red before the pages existed
- [x] The rail's Practice entry and the detail page's "Practice this" are now links

### Deferred conversions — updated

- ~~card is an `<article>`~~ done (phase 6) · ~~toolbar inert~~ done (phase 7)
- ~~rail Practice entry~~ and ~~"Practice this"~~ — **done**, both are links now.
- ~~rail Weak topics entry~~ — **done**. The deferred-conversion list is empty.
- Still open, and phase 10's actual scope rather than a conversion: the add/edit
  dropzone renders disabled, and the Visual section and Lightbox stay unreachable
  until something can set `mental_model_image_path`.

### Deferred by DESIGN.md section 7

"Review the N you missed" on the completion screen: skipped. It needs a second queue
path — a session seeded from a previous session's results — which is not free.

### New domain functions

`seededShuffle` and `sessionTally` / `sessionSummary`. See ARCHITECTURE.md for why
phase 2 could not have written the shuffle: it had no consumer, and the obvious
implementation is impure in exactly the places this needs to call it.

## Phase 9 — weak topics

- [x] `/weak` server component: page head with real counts, the ordering banner with
      "Practice all N", the list rows, the per-row Practice button
- [x] Empty state: "Nothing needs review", with "+ Add topic" and "Practice anyway"
- [x] The rail's Weak topics entry is a link — **the deferred-conversion list is now empty**
- [x] 7 Playwright specs, written and run red before the page existed

### Two things reported rather than assumed

**`selectPracticeSession` could not produce this list.** It caps at ten and shuffles
ties. `orderForPractice` was extracted so the ordering has one definition; the session
function is now that plus the slice, and its contract and tests are unchanged.

**"Practice all N" did not follow from the existing URL scheme.** `?all=1` waives the
floor over the whole library and `?topic=` is a single id; neither means "this subset".
`?scope=weak` is one new case, waived on the same reasoning as `?topic=`.

### One small domain addition

`lastPracticedLabel(topic, now)` — the row's "never practiced" / "last practiced 12
days ago" tail. Choosing between the two is a comparison, and comparisons do not live
in components.

## Phase 10 — image upload

- [x] Upload, replace, remove; signed URLs resolved during the server render
- [x] Dropzone with drag state, indeterminate upload bar, cancel, attached state
- [x] Partial-failure handling: the topic saves, the banner states the real reason
- [x] The Visual register and Lightbox are real, on detail and on the practice reveal
- [x] Delete removes the object first, then the row
- [x] Bucket-level size and mime limits — the server-side rule, with 3 pgTAP assertions
- [x] `ARCHITECTURE.md` gains the full data flow
- [x] 7 Playwright specs, written and run red before any of it existed

### The one new migration, and why phase 1 missed it

`*_mental_models_bucket_limits.sql` sets `file_size_limit` and `allowed_mime_types`.
Phase 1 specified the private bucket and its four RLS policies, and RLS answers *who*
may write, never *what*. Nothing could upload until now, so the shape of an acceptable
upload had never come up. No new policies, no new tables.

### A latent flaw phase 10 exposed in phase 1's tests

Two storage assertions counted objects across the whole bucket while running as
`postgres`, which has BYPASSRLS. They were only ever correct because the bucket was
empty; the moment real uploads existed they started counting them. Now scoped to the
fixture user's folder. The bug was always there — nothing before this phase could
reveal it.

### Storage isolation

Object paths are `{user_id}/{topic_id}/{filename}` and every spec-created topic has a
fresh uuid, so two runs cannot collide. Specs that upload also delete their topic,
which removes the object first by construction. The seed purges the fixture users'
folders, because objects survive a `db reset` and rows do not.

## Phase 11 — e2e, a11y, docs

- [x] `e2e/journey.spec.ts` — the definition of done, one user, the whole loop
- [x] `e2e/a11y.spec.ts` — 8 checks against DESIGN.md section 6, driven by keyboard
- [x] Screen-by-screen audit against `design-reference.html` (below)
- [x] The deferred `jwt_expiry` manual check, performed and reported
- [x] `README.md`, `ARCHITECTURE.md` and this file final

### The screen audit

`design-reference.html`'s tab bar carries **20** screens, not 21 — DESIGN.md said 21 and
has been corrected. All 20 are built.

| # | Screen | Built | Note |
|---|---|---|---|
| 1 | signin (incl. error) | yes | Error markup diverges deliberately — see below |
| 2 | signup (incl. submitting) | yes | |
| 3 | library | yes | |
| 4 | loading | yes | `loading.tsx`; skeletons match card geometry |
| 5 | empty | yes | |
| 6 | noresults | yes | Distinct from empty; offers `Search all N` and `+ Add "q"` |
| 7 | loaderror | yes | `error.tsx`, showing the real error |
| 8 | add | yes | |
| 9 | addfail | yes | Real reason, real size, real limit |
| 10 | edit | yes | With existing image, Replace and Remove |
| 11 | detail | yes | |
| 12 | lightbox | yes | |
| 13 | delete | yes | Copy derived, not literal — see below |
| 14 | practice-q | yes | |
| 15 | practice-a | yes | |
| 16 | practice-done | yes | Minus "Review the N you missed" (DESIGN.md §7) |
| 17 | practice-thin | yes | With the override |
| 18 | weak | yes | |
| 19 | weak-empty | yes | |
| 20 | mobile | yes | Built in phase 12 — tab bar, FAB, Weak as a chip, collapsed filters |

### Deliberate divergences, as decisions

| Divergence | Reason |
|---|---|
| Field errors sit outside the `<label>` | The mock nests them, which folds the error text into the input's accessible name. Explicit `htmlFor`/`id` plus `aria-invalid`, `aria-describedby` and `role="alert"`. Visually identical |
| Delete copy is derived, not literal | The mock names a diagram and a practice count unconditionally. Naming something that is not there contradicts the same document's rule that the confirmation names what *actually* dies |
| The lightbox's Esc chip is a real button | The mock shows a hint. A hint is not an affordance — pointer users had nothing to click and the control had no accessible name |
| The upload bar is indeterminate | `storage-js` `upload()` exposes no progress callback. A percentage would be invented |
| The topic card is a link, not a button | It navigates. A link gets middle-click, open-in-new-tab and the browser's own affordances free |
| No search-term highlighting | DESIGN.md §7 defers it, and it is not free — it needs a match-splitting function and its own tests |

### Deliberately not built

- From DESIGN.md §7: search-term highlighting, "Review the N you missed", undo on the
  edit toast, per-option counts in the difficulty select.
- No password reset, OAuth or profile management — the brief said email and password only.
- No spaced repetition, scoring, streaks, charts or analytics.
- One image per topic; no cropping, editing or annotation.
- No `quiz_attempts`, `practice_sessions`, `categories` or analytics tables. One table.

### The `jwt_expiry` check, performed

Lowered to 5s, stack restarted, a real refresh driven past expiry, config restored and
the stack restarted again. Observed on the refreshing response:

```
set-cookie    : present
cache-control : no-cache, must-revalidate
expires       : 0
pragma        : no-cache
session       : survived
```

`Expires` and `Pragma` are the package's. **`Cache-Control` is Next's**, not the
package's `private, no-cache, no-store, must-revalidate, max-age=0`. Not cacheable
without revalidation either way, but `private` and `no-store` are absent. Recorded in
ARCHITECTURE.md, and closed in issue #9 by setting the header directly.

---

## The backlog lives in GitHub issues

Everything this build knew it was leaving undone is tracked at
[github.com/sinhasagar01/recall/issues](https://github.com/sinhasagar01/recall/issues),
so there is one place to look and nothing to keep in step by hand.

| Label | Means |
| --- | --- |
| `blocks-multiuser` | Ship before a second real person signs up |
| `blocks-public` | Ship before the app is public |
| `scale` | Works now, breaks as data grows |
| `billing` | Paid tiers and entitlements |
| `tech-debt` | A known compromise, recorded deliberately |

The two that carry the most weight are
[#1 account deletion must remove storage objects](https://github.com/sinhasagar01/recall/issues/1)
— a compliance failure rather than a missing feature, and the one item worth blocking a
second signup on — and
[#4 paginate the library and move filtering server-side](https://github.com/sinhasagar01/recall/issues/4),
which is the ceiling on the current design and carries the two non-obvious parts of that
work.

**This file stays the historical record.** It says what each phase decided and why, what
was deliberately not built, and what the build discovered along the way. It is not the
to-do list, and nothing below should be updated to reflect work done later — the point of
it is that it describes the twelve phases as they happened.

---

## Phase 12 — mobile navigation

- [x] Bottom tab bar below 860px: Library and Practice, plus the centre FAB
- [x] Weak topics is a filter chip on Library, not a third tab (DESIGN.md §4.8)
- [x] The three Selects collapse behind one `Filters` chip, into the existing Sheet
- [x] Add Topic is full-bleed on mobile, a side sheet from `md` up
- [x] Practice hides the tab bar — it is in its own route group, so it never had one
- [x] 7 Playwright specs at 390×844, written and run red before the layout existed
- [x] The desktop suite passes unchanged, which is the proof desktop did not move

### Where sign out went

The mock does not place it. It sits in the Library page head on mobile, beside the
title — the default destination, always one tap away. The tab bar has two destinations
plus the FAB and no room for a third, and burying sign out inside the Filters sheet
would be worse than obvious.

### Two additions to existing components, both flagged before building

**`Sheet` gained a close button.** It had none: Escape and the scrim worked, but there
was no visible affordance, and a phone has no Escape key. The reference's sheet head
shows `Close [Esc]`.

**One new quick filter, `needs-review`.** The mobile chip row's "Weak" means the
weak-topics membership rule — `confidence = 'new' OR 'weak'` — which neither
`confidence` nor the existing quick filters could express. It calls the existing
`needsReview` predicate, so it adds a way to ask for a rule, not a second copy of one.

### Two problems this phase created and caught

**A circular import.** `search-filter` needed `needsReview`, which lived in `library`,
which already imports `search-filter`. It worked only by accident of lazy evaluation.
`needsReview` moved to `confidence.ts`, beside `isNeverPracticed`, where it belongs.

**A focus regression, caught by the phase 11 audit.** Sheet's new close button became
the first focusable element, so opening "Add topic" put the caret on Close and a
keyboard user typed their title into a button. The focus trap now focuses the first
form *control* when the dialog has one, falling back to the first action otherwise —
so the delete confirmation still lands on "Keep it". Two component tests pin both.

---

## Verified against the hosted project

Added after the twelve phases, and kept separate from them deliberately — the phase
sections above are the historical record and are not edited to reflect later work.

### The storage path is no longer untested in the cloud

Phase 10 built upload, replace and remove, and its seven Playwright specs have always
run against the local stack. Nothing had ever exercised that path against the hosted
project, which was noticed during the product review: no seeded topic carried an image,
so the reviewer could not reach a lightbox at all.

Driven end to end on https://airlocklab.com, with the bucket inspected directly rather
than the UI believed:

| Step | Result |
| --- | --- |
| Upload | Accepted, dropzone showed the filename with Replace and Remove, saved |
| Signed URL | Resolved in the browser — the image loaded at its real dimensions, not a broken box |
| Lightbox | Opened, carried its `Esc` button, closed on `Esc` |
| Replace | New object stored, row patched, **old object deleted** — the bucket held only the new file |
| Remove | Object deleted **and** `mental_model_image_path` cleared |

No HTTP errors and no console errors throughout. Bucket-wide afterwards: one object,
one row pointing at it, zero orphans.

### The hosted storage policies match local

Same private bucket, same 5 MB `file_size_limit`, same `png/jpeg/webp`
`allowed_mime_types`, and all four policies present. Probed against another account's
object path:

```
anonymous direct read        -> 400
anonymous signed-URL request -> 400  {"error":"not_found","message":"Object not found"}
public-bucket read           -> 400
```

The middle one is the one worth having: it answers **not found** rather than forbidden,
so another user's object is indistinguishable from one that does not exist. That is the
same enumeration-safe behaviour `supabase/tests/storage_test.sql` asserts locally, now
confirmed hosted.

### What this does not cover

The size and mime limits were not driven from the browser here — they have pgTAP
coverage locally and the hosted bucket carries identical values, but an oversized or
wrong-typed upload has not been attempted against the cloud.

## Shipped after the review

The product review (walking the deployed app, not the source) produced three fixes and
three issues. What has shipped since:

| | |
| --- | --- |
| Rail wayfinding | Library was a `<span aria-current="page">` on every page, so `/weak` had no way back on desktop and the rail claimed the wrong location. All three entries are links and `aria-current` follows the route |
| Weak page zero-topics state | It said "Every topic is at okay or better" to someone with no topics. Split, the way the library page always split empty from no-results |
| Sticky rail | It scrolled away with the page. Sticky at `h-screen` from `md` up, foot pinned. The reference does not specify this — see DESIGN.md |
| Settled-but-quiet (#13) | Confidence never decays, so `/weak` emptied permanently. A second list beside the first: settled, and not practised in 60 days. The grade is untouched |
| Export (#15) | Every topic as a zip — `library.md` to read, `library.json` for a machine, and the images. There was no way out at all, and the hosting has no automated backups |
| Settings | Two things: change a password (requiring the current one) and export. In the account foot, not a nav entry |

Each carries its own regression. The wayfinding one is the notable one: it asserts the
general property — from every route in the `(app)` group, a visible link to the library
exists — by enumerating the route group rather than naming remembered screens. Twelve
phases missed the defect because every existing spec asserted a link it already knew
about.

### The backlog now

| Issue | |
| --- | --- |
| [#14](https://github.com/sinhasagar01/recall/issues/14) | Demote difficulty out of the add-topic form. It is set at capture and never read by practice selection |
| [#7](https://github.com/sinhasagar01/recall/issues/7) | Subscriptions, Stripe webhook, quota enforcement. Only when there is something to bill for |

#13 closed with the settled-but-quiet list; #15 closes with export.
