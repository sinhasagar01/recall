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
| 16 | practice-done | yes | Minus "Review the N you missed" (DESIGN.md, "Out of scope") |
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
| No search-term highlighting | DESIGN.md, "Out of scope", defers it, and it is not free — it needs a match-splitting function and its own tests |
| No "Recently learned" section | The mock draws one and the build shipped it. Two visually identical grids read as one list in the wrong order, not as two sections: a topic saved five seconds ago sat at position 24 of 29. The split was also local-mode only, so the same library rendered differently either side of the 500-row boundary. Removed in favour of one list, newest first, with the recency timestamp kept on the card |

### Deliberately not built

- From DESIGN.md "Out of scope": search-term highlighting, "Review the N you missed", undo on the
  edit toast, per-option counts in the difficulty select.
- No password reset, OAuth or profile management — the brief said email and password only.
- No spaced repetition, scoring, streaks, charts or analytics.
- One image per topic; no cropping, editing or annotation.
- No `quiz_attempts`, `practice_sessions`, `categories` or analytics tables. One table.
  Still true after quizzes shipped: a quiz is a row in `topics`, and it keeps no history,
  score, streak or timer of its own. Its record is the same `confidence`,
  `practice_count` and `last_practiced_at` a topic keeps.

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
- [x] Weak topics is a filter chip on Library, not a third tab (DESIGN.md, "Behaviour the mock encodes")
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

---

## Phase 13 — quizzes as a second content type

A question with 2+ options, one correct, and an explanation. Hand-written; **no AI
anywhere**. Specified by `quiz-reference.html`, which supersedes any earlier quiz mock and
is read under the precedence rule recorded in DESIGN.md, "How `quiz-reference.html` is
read".

**One table, two shapes.** `kind text not null default 'topic'`, `options text[]`,
`correct_option int`, and `definition` loses its NOT NULL — the guarantee moves into a
kind-aware CHECK beside the others rather than weakening. `topics_shape_is_consistent`
holds the whole coupling in both directions: a quiz needs 2+ options and an index into
them and must have no definition and no image; a topic needs a definition and neither of
the other two.

### The constraints were written before the migration, and shown red

`supabase/tests/quiz_shape_test.sql` — 29 assertions, run against the un-migrated schema
first. Invalid indices in both directions and at the boundary, both directions of the
kind/options coupling, and the coupling surviving an UPDATE rather than only an INSERT.

The first version of the CHECK **accepted an options-less quiz**, because
`array_length(array[]::text[], 1)` is NULL, not 0, and one NULL conjunct makes the whole
CASE branch NULL — which a CHECK passes. The migration comment had explicitly claimed the
opposite. Written up as ARCHITECTURE.md, "The rule: a CHECK must be proven to reject, not
proven to accept".

### The union was not the map it was claimed to be

`Topic = TopicRecord | Quiz` was expected to turn every place assuming one shape into a
compile error. Of nine `.definition` reads, `tsc` flagged **two** — the ones that consume
it as a `string`. The three that merely render it stayed silent, because `definition` is
`string | null` on the union and JSX renders null as nothing. A quiz card would have shown
an **empty** excerpt where the reference specifies none.

Those three are held by three Playwright **absence** assertions, written red before the
narrowing. ARCHITECTURE.md, "A discriminated union only catches reads it makes
type-incompatible".

### The two-option case first, and what only three options can prove

Built and verified before the three-option one, because it is the shape with no quiet
third: both options are marked and the muting rule has nothing to apply to, so an
implementation that painted every non-answer red would look completely correct there.

Proven by perturbation. With the state rule broken to `isAnswer ? 'correct' : 'wrong'`,
all four two-option tests pass and the three-option test fails. A second perturbation
painting `muted` in `--flag` fails the computed-colour assertion, so the `data-state`
attribute cannot drift away from what is actually painted.

### Two assertions that were measuring the fixture, not the feature

A weak-page membership assertion that was passing on ordering luck (60-row page, 275 rows
needing review), and a write-completion assertion reading optimistic copy that renders
before the response. Both recorded as ARCHITECTURE.md, "An assertion about a row in a
paged, ordered list is not an assertion about the row".

Adding the quiz specs also made `shortcuts.spec.ts › P starts practice` start failing
about one full-suite run in three — not a regression in P, but a hydration race it had
always been in and had always won. Confirmed by rebuilding the tree without the quiz work
and running the suite clean three times. It now retries the way its sibling slash test
already did.

### Three latent defects this phase exposed

None was introduced by quizzes; each was a rule that had never been asked the question.

- **The focus trap treated hidden inputs as focusable.** `input:not([disabled])` matches
  `type="hidden"`, and `.focus()` on one silently does nothing. The sheet had carried
  hidden inputs for tags and category since phase 3, but always *below* the field the trap
  picked. The type toggle put one above, and the caret landed nowhere — a topic could no
  longer be added without a mouse. Radios and checkboxes are now skipped as "first field"
  too: a mode toggle is a setting, not the thing a dialog is there to be filled in with.
- **`Number('')` is `0`.** An unmarked answer arrives at the action as an empty string, so
  a coerced parse would have marked the first option correct and saved happily. Caught by
  a domain test feeding the parser a shape a form cannot produce; the index is now read
  from digits.
- **A `kind`-only filter took the unfiltered read path.** `hasFilters` did not know about
  it, so the chips looked inert on a server-mode library — and the server page never read
  `kind` from the URL at all. Both found by driving the chips rather than by reading them.

### Not built, deliberately

No quiz history, scores, streaks, analytics or timers. No images on a quiz — enforced by
the CHECK, not only by the form. No type chips on the weak page; see DESIGN.md for why
that is a not-yet rather than a never.

---

## Phase 14 — three fixes from a product review

Found by driving the deployed app rather than by reading it: the practice card's reveal
shortcut died the moment you followed the instruction printed above it, Save opened below
the fold in the add sheet at 390x844, and the Category control opened on `Uncategorized`
while the app had already computed a suggestion and labelled it. All three shipped and
verified on production at `bbc7794`; the open backlog is now #16, #17 and #18 alongside #7.

Each fix was shown to bite by reverting it and watching its own assertion fail. The most
useful thing the review turned up is why the first one survived since phase 8: the
existing spec focused its way *out* of the recall textarea before pressing anything, so it
only ever proved Space works for the one person the card is not asking for.

### The backlog now

| Issue | |
| --- | --- |
| [#16](https://github.com/sinhasagar01/recall/issues/16) | Order by difficulty as a tiebreak within a practice bucket. 60% of hard topics need review against 25% for medium and easy; the column is a passthrough in the ordering SQL and appears in no `order by`. Partially reverses #14's reasoning — nothing read it, and the fix chosen was to stop asking rather than to read it |
| [#17](https://github.com/sinhasagar01/recall/issues/17) | Remove the "Recently learned" section, so the library is one list newest-first. A topic saved five seconds ago sat at position 24 of 29 |
| [#18](https://github.com/sinhasagar01/recall/issues/18) | Retire the mental-model image, judged on its own use: 1 of 58 rows, 1 storage object, 0 of the owner's 26 topics in two months. Explicitly **not** the fix for the sheet overflow, which phase 14 handled as a layout problem with every field kept |
| [#7](https://github.com/sinhasagar01/recall/issues/7) | Subscriptions, Stripe webhook, quota enforcement. Only when there is something to bill for |

#14 closed with the quiz phase, which settled that neither shape asks difficulty at capture.

---

## Phase 15 — one library list

[#17](https://github.com/sinhasagar01/recall/issues/17). The library rendered two grids
with a "Recently learned" divider between them, so a topic saved five seconds ago sat at
position 24 of 29. Replaced with one grid, `created_at desc`; the recency timestamp moved
onto the card and now runs in both reading modes rather than only in local mode.

The change is JSX only. `rows` was already `created_at desc` in both modes, so removing
the partition *is* the ordering rule — no query, cursor, page size or parity expectation
changed.

Two findings recorded in ARCHITECTURE.md, both larger than the fix:

- **The split was local-mode only**, so the same library rendered in a different order
  either side of `LOCAL_MODE_MAX`. The parity harness could not see it, correctly — it
  stops at the data layer, and the divergence was downstream in JSX. A harness proving two
  modes agree on data does not prove they agree on what is rendered.
- **Every fixture was seeded with rows stamped `now()`**, so no fixture could express any
  date-dependent behaviour, and an assertion written against one would have passed on day
  one and stayed green. The `few` topics are backdated and the general-purpose fixture —
  the one specs write to — gained two backdated topics.

The assertion is about position, not presence: **nothing older than a week may precede a
topic saved seconds ago.** Deliberately not a literal "first card" — the suite is
`fullyParallel` and several specs save to that fixture, so another test's row can land at
index 0 mid-run without anything being wrong. The property is stronger than an index and
is exactly what the old layout violated.

### #16 and #18, closed without building

- [#16](https://github.com/sinhasagar01/recall/issues/16) — difficulty as a practice
  tiebreak. The "60% of hard topics are weak" statistic says difficulty predicts which
  *bucket* a topic lands in, and `confidence` is the measured version of that same thing,
  already the primary sort key. Difficulty's only real job was ordering the never-practised
  group: two rows. And placing it above staleness, as the issue proposed, falsifies
  `practice_ordering_test.sql:139` — a proposal requiring the deletion of a deliberately
  written property is rejected on that basis alone. Reopen on a bulk import.
- [#18](https://github.com/sinhasagar01/recall/issues/18) — retire the mental-model image.
  Declined. It works, it is tested end to end including hosted storage policies, and the
  sheet overflow it was offered against was already fixed as a layout problem in phase 14
  with every field kept. Low usage is not a reason to delete working, verified machinery.
  So "a quiz that needs a diagram is a topic" keeps its meaning and the storage
  delete-order rule stands.

---

## Phase 16 — the fixture cannot silently rot

[#19](https://github.com/sinhasagar01/recall/issues/19). Seeding moved from the `test:e2e`
npm script into `globalSetup`, so no invocation of Playwright can skip it, and
`e2e/fixture-invariants.ts` checks the shape the specs assume before any browser starts.

**The issue's central claim was wrong and was corrected.** It said `npm run verify` does
not re-seed; `verify` was expanded to prove it and `test:e2e` was not, and `test:e2e` was
where the seed lived. `verify` had always been safe. The real gap was that raw
`npx playwright test` was not — two entry points, one of them correct.

Verified by driving the fixture past the boundary rather than reasoning about it: at 604
rows one spec failed, at 785 **thirteen** failed across four unrelated files. With the fix
in place and the fixture sitting at 809 rows, a cold `npx playwright test` reseeds and
passes. The guard was perturbed by disabling the seed, and fired naming the row-count
invariant and what depends on it.

Three consecutive `npx playwright test` runs with no reseed between them: 125, 125, and
one pre-existing load flake. That flake reproduces identically on the pre-change code at
the same rate, checked by stashing — `practice.spec.ts` "Escape leaves a practice session"
and `shortcuts.spec.ts` "N opens the add sheet" trade places between runs, which is the
signature of hydration racing under parallel load rather than anything about fixtures.

---

## Phase 17 — evidence on a topic

Four markers. Recall is derived from confidence and never stored; Rebuild, Challenge and
Production are each absent, or present with a date, a required note and an optional URL.
Specified by `evidence-reference.html`. It records the three things `confidence` cannot:
whether you can implement a variant, solve a constrained problem with it, and use it in a
real decision.

**Nine scalar columns, not a jsonb document.** `TopicBoundaryIsSound` asserts the generated
row and the domain `Topic` are the same shape, and `supabase gen types` renders jsonb as
`Json` — which every object satisfies — so a document would have made that assertion
vacuous for exactly the columns being added. Scalars also perturb one clause at a time,
which the brief required. The quiz phase set the precedent: typed columns plus a shape
CHECK, not a second table and not a blob.

**A sibling constraint, `topics_evidence_is_consistent`**, rather than an edit to
`topics_shape_is_consistent`. Two constraints mean a violation names which rule broke, and
it avoids rewriting a constraint that carries the hard-won `coalesce(array_length(...))`
fix.

### Evidence never touches the queue, asserted in four places

The failure mode: the moment practice reads evidence there are two confidence systems.

1. `src/lib/domain/evidence-boundary.test.ts` — reads the **source** of the seven queue
   modules and the practice/weak migrations and fails on the mere *mention* of a column
   name. Column names come from the domain, so a rename cannot orphan it.
2. pgTAP — evidence on the first topic, then the second, must not move the order.
3. A domain unit on `orderForPractice`.
4. A Playwright assertion that the rail counts do not move.

All four were shown failing before being trusted.

### Four things the tests caught that reasoning had approved

| | how it looked | what caught it |
| --- | --- | --- |
| the `note is null or` disjunct is redundant | a clause with a written NULL analysis | perturbation: removing it failed nothing |
| four of nine clauses untested | a thorough 26-assertion file | perturbation: blanking them failed nothing |
| the queue-ordering assertion could not move | a passing test of the failure mode | perturbation: the tie-break still passed |
| `library_page` returned no evidence columns | five green `tsc` errors, all fixtures | Playwright: filtered cards showed squares for empty rows |

The last is the sharpest. A **filtered** library read (`?q=`) takes the SQL path, and the
RPC's `RETURNS TABLE` had no evidence columns — so they arrived `undefined`, and
`undefined !== null` made every filtered card claim evidence it did not have. `tsc` cannot
see a SQL contract. `evidenceFor` now compares with `== null` so a missing column renders
nothing rather than inventing something, and the RPC had to be **dropped and recreated**:
Postgres refuses to change a function's return type in place, and it says so as a migration
error — which I missed once by sending the reset output to `/dev/null`.

### Two traps tested rather than noted

- **The date is a parameter.** `localDateString(now)` is a pure domain function using local
  getters, unit-tested just after midnight and late evening — the hours where
  `toISOString().slice(0, 10)` returns the wrong day. The dialog takes `today` as a prop
  and never reads a clock.
- **The Record button is keyboard-reachable while invisible.** A component test tabs to it
  and activates it with no pointer event. It caught a real defect on the way: the
  accessible name computed as **"Recordrebuild"**, because name computation concatenates
  text nodes without separators, so the visible text plus an `sr-only` span announced as
  one word. Replaced with an explicit `aria-label`.

Also removed `pointer-events: none` from the hover reveal — it made the button unclickable
until a hover had resolved, which surfaced as a 30-second Playwright timeout on a button it
could plainly see. The reference uses opacity alone, and opacity alone is right.

### Card foot, and one thing deliberately not decided

The right slot holds **one** element: the squares when a topic has evidence, `Model ✓` when
it has none, `Practiced N×` on a quiz. An early draft of the reference drew cards with no
`Model ✓`; that was an oversight in the drawing, not a decision, and the reference now says
so.

**Open question, not decided here:** `Model ✓` appears on 26 of 26 topics, so it
discriminates nothing. Whether it should exist at all is its own decision and was
explicitly kept out of this feature.

### Not built

No scheduling — no due dates, no `next_review_at`, no 1–3–7–21; that cadence runs manually
outside the app by decision. No dashboard, phase progress, capability map, Today page or
course checklist. No completion state, badge or celebration. No document storage: an ADR is
a URL. No AI, no analytics. Evidence is not searchable — the note names the artefact, not
the concept, so "the capstone" would match every topic used in it.

### Closing the evidence phase

Shipped in `cb743b6` and verified on production: the schema push left all 56 rows intact
and gave none of them evidence, the constraint was proven to *reject* there (five invalid
writes, all `23514`, nothing left behind), and `practice_ordered_page` still cannot see an
evidence column. Recorded a rebuild by hand, confirmed it on the detail page and as a
single square on the card **with a query active** — the filtered read takes the SQL path
and is where the missing `RETURNS TABLE` columns had made every card claim three markers.
Confirmed a quiz renders no section, and that `library.md` reads well with the Evidence
block between the mental model and the practice line. The test evidence was removed
afterwards: it claimed work that had not been done.

One follow-up fix: the hover-revealed Edit button sat on the date line once a note wrapped
to two lines. It is now in normal flow with `mt-auto` rather than absolutely positioned, so
overlap is impossible by construction rather than by a reserved-padding guess — and the
first guess *was* wrong, because a Tailwind size override loses to class ordering and the
button is 42px rather than the 27px it looks like. Asserted as non-intersection of two
bounding boxes, with the note verified to have actually wrapped, and proven by restoring
the absolute positioning and watching it fail.

---

## Arc 2 — sources

Where a topic came from. A source is the video or article you learned from: title required,
course and URL optional, transcript optional and deletable. Topics and quizzes link to it.
Specified by `sources-reference.html`. The transcript is scratch you work from, never a
library of its own — you paste it, distil out of it, and delete it.

**The first new table since the schema was built, and the reasoning is the point.** `kind`
discriminates `topic` from `quiz`, and those two are the same kind of thing: a practisable
retrieval unit sharing `confidence`, `practice_count`, `last_practiced_at` and `difficulty`.
A source has none of that. A third `kind` would have meant a third arm on the shape CHECK
nulling a dozen columns, a third arm on the `Topic` union that is not a Topic, a
`topics.source_id` that could point a row at itself — and, worst, `p_kinds` defaults to null
meaning *both shapes*, so `practice_ordered_page`, `library_page` and `library_counts` would
each have had to learn to exclude a third kind. Forgetting one puts a transcript in the
practice queue. Seventeen phases held at one table because everything in it was a
practisable unit; this is the first thing that genuinely is not one. The rule was never
"one table forever", it was "do not invent an entity for something that is already a topic".

**`source_id` is on the `topics` row and deliberately not on the domain `Topic`** — omitted
from `TopicRow` the way `search_text` is, for a different documented reason. It is what
makes "a source never reaches the queue" absolute rather than careful: if it were on the
domain type, `TopicBoundaryIsSound` would oblige every read to return it, including
`practice_ordered_page`, and the boundary test would need an exception carved out for the
one module it most needs to cover. Both `RETURNS TABLE` contracts are untouched, which also
avoids the drop-and-recreate the evidence arc needed. The cost, stated: topic detail reads
its source with its own query, and the edit sheet takes it as a prop.

**Four of the five extractions are derived, one is a stored tick.** Only "when not to use
it" is stored, because nothing in the data distinguishes that topic from any other, and the
UI labels it as the exception. The challenge item reads arc 1's `challenge_at` on any linked
topic — a sources module reading an evidence column, which the evidence boundary permits
because it forbids evidence columns in *queue* modules.

**The transcript is searched client-side**, over text the workspace has already loaded. Not
an optimisation: the way to keep a transcript out of library search is to never build a
server-side way to search it. It is out of library search either way, since `search_text`
lives on `topics`.

### Two corrections written back into `sources-reference.html`

The reference was wrong twice, and both corrections went into the file rather than only
into DESIGN.md, so it stops asserting something false.

1. **It drew the mobile screens without showing how you reach them.** Sources sits beside
   Settings in the account surface, following the precedent Settings set; rule 13 is
   untouched and the tab bar keeps its three items. A third correction was found while
   building: the desktop rail's account foot is *not* that surface — the whole rail is
   `hidden` below `--breakpoint-md`, so a link in its foot renders at no width at all. The
   mobile account surface is the `md:hidden` cluster in the library head. The Mobile tab
   now draws it.
2. **It argued for crimson without checking the token rule.** `--flag` gained a fourth
   named case, worded narrowly: a stale source's yield *label*, never the row. A crimson row
   would read as an error, and a stale source is not an error, it is a fact about you.

### Transcripts are excluded from the export, explicitly

`library.json`'s "every column, not a summary" now has one stated exception. Every source
exports its whole record plus `transcript_words`; no body, in either file. Both DESIGN.md
and `library.md` itself say so and give the reason, because a reader finding a source with
a word count and no text must be able to tell that was a decision rather than a bug.
Asserted twice: the renderer drops a body even when handed one, and the export query never
selects it in the first place — which is what protects `library.json`, since that file is
serialised straight from the query result. Both assertions were perturbed and seen to fail.

### What shipping it cost — two production incidents, both mine

Recorded because both were caught on production rather than by the suite, and both had a
guard that could have existed beforehand.

**1 · A signed-out `/sources` answered 500 instead of redirecting.** The proxy's `GUARDED`
list is hand-written and the route was never added. Not a leak — RLS scopes every read —
but a 500 on a shipped page. The list was the defect, so `guarded-routes.test.ts` now holds
it to the route tree in both directions; `/export` is recorded as the one self-guarded
exception, since it answers 401 rather than redirecting so a browser cannot save the
sign-in page's HTML under the name of a zip.

**2 · `sources` shipped with no `GRANT`, and took the whole app down.** Every page in the
(app) group answered 500, not only `/sources`, because `countSources()` runs in the shared
layout. The second time this has happened — `20260828052220_topics_grants.sql` exists for
exactly this and explains it in its own comment.

The trap is that **no test against the local database could have caught it.** Supabase
grants new `public` tables through default ACLs locally, so `has_table_privilege` passes
whether or not the grant migration exists; a hosted project does not apply those defaults
to a table created by a migration on a running project. `topics_test.sql`'s privilege
assertions look like the guard and never were one. So the guard reads the migrations:
`table-grants.test.ts` extracts every `create table public.x` and asserts a matching grant.

The general lesson, recorded in ARCHITECTURE.md: when local and production differ in a
*default*, testing against local proves nothing about production — the assertion has to
move to the artefact that is identical in both.

### Verified on production, then cleaned up

The whole list walked by hand against airlocklab.com: a source added with a transcript and
distilled from, the source line on the topic and the entry in the derived list, transcript
deleted with the source and entries surviving, source deleted with the topic surviving and
its source line gone, Sources reached from the library head cluster beside Settings at
mobile width with the tab bar untouched, and an export whose `library.json` carried
`transcript_words: 20` and no `transcript` key at all. Anon was denied on the production
host at the GRANT gate — it never reaches the policies, since the grant names only
`authenticated`. Everything created was deleted.

Two copy defects found in that walk and fixed after: `1 topics`, and a delete confirmation
whose verb and pronoun did not agree with its count. The pluralisation now lives in
`lib/domain/plural.ts` and the confirmation's whole clause in `deleteSourceCopy`, tested at
nothing, one and many — the noun was pluralised at the call site, which is exactly what
made the verb and pronoun easy to miss.

### Found, not fixed

The library head's `+ Add topic` button carries `className="hidden md:inline-flex"`, but
`Button` hardcodes `inline-flex` in its own class string and Tailwind orders both utilities
in the same display group — so `hidden` loses at every width. Measured at 390px: the button
computes to `display: flex`, sits at x=399, and makes the page 106px wider than the screen.
Pre-existing, unrelated to this arc, and left for its own change rather than widened into
this one.

---

## The backlog

**Issues**

| | |
| --- | --- |
| [#22](https://github.com/sinhasagar01/recall/issues/22) | `+ Add topic` is visible at mobile width and makes the library page 106px wider than a 390px screen. `hidden` loses to `Button`'s hardcoded `inline-flex` in the same Tailwind display group, so any consumer passing a display class hits it silently. Found during arc 2, unrelated to it |
| [#21](https://github.com/sinhasagar01/recall/issues/21) | `journey.spec.ts` leaks a user per run and fails silently |
| [#20](https://github.com/sinhasagar01/recall/issues/20) | Keep the recall attempt. **Stays open deliberately** — it was properly planned, it conflicts with nothing in arcs 2–6, and closing it because the queue moved on would discard the plan |
| [#7](https://github.com/sinhasagar01/recall/issues/7) | Subscriptions, Stripe webhook, quota enforcement. Only when there is something to bill for |

**The apprenticeship arcs.** Arcs 1 and 2 — evidence on a topic, and sources — are closed.
Three remain, plus a sixth that is a different kind of decision:

| Arc | |
| --- | --- |
| 3 · Phases | A subject studied as a set rather than an endless ten |
| 4 · Ledger | The record of what was done, over time |
| 5 · Today | One surface answering what to do now |
| 6 · AI | **Decided, not open.** See below |

Nothing in arcs 2–5 is being designed here, and each of the other exclusions the spec
holds — **no scheduling, no dashboard, no analytics, no gamification** — survives until a
decision explicitly overturns it. Arcs 2 to 5 inherit them.

### Arc 6 — AI is decided, and the no-AI exclusion is being retired

Recorded here rather than argued later. **The exclusion is retired deliberately, after the
five screens are built** — not relaxed quietly inside a feature, and not before the product
it is meant to serve exists.

**Five uses, and only these five:**

1. Challenge my mental model — argue with what I wrote, rather than replace it.
2. Find what I missed in a video.
3. Draft retrieval questions.
4. Draft quiz distractors.
5. Interview mode.

**Explicitly NOT: generating definitions or mental models.** Writing those *is* the
learning, and a generated mental model is one I have never had. The library's value is that
26 of 26 mental models are hand-written corrections of a wrong model — a generated one
would look identical and teach nothing. This is the line the feature exists on the far side
of.

**Guardrails, recorded now so they are inherited rather than argued at the time:**

- **The key is server-side only.** `NEXT_PUBLIC_` on an AI key is the same class of mistake
  as `NEXT_PUBLIC_` on the Supabase secret key, and `secret-key-boundary.test.ts` already
  establishes how that rule is held: a source-level assertion, not a convention.
- **Every call is opt-in, per action.** Nothing generates on save. Capture stays the cheap,
  synchronous thing it is today.
- **Nothing AI-written is ever stored as a topic field.** Not `definition`, not
  `mental_model`, not a `note`. If a suggestion is worth keeping, it is worth retyping —
  and retyping is the point.
