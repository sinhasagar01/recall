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

## Phase 6 — topic detail

- [ ] Detail (full), edit form, delete confirmation naming the practice count, lightbox

## Phase 7 — search and filters

- [ ] Wired to the phase 2 functions; no rules re-implemented in components
- [ ] No-results state offering `+ Add "<query>"`

## Phase 8 — practice

- [ ] Recall · reveal + grade · session complete · too few topics (with override)
- [ ] Grades persist per answer, not at session end
- [ ] Grade buttons reachable by `1` / `2` / `3`

## Phase 9 — weak topics

- [ ] List and empty states

## Phase 10 — image upload

- [ ] Upload, replace, remove; signed URLs
- [ ] Partial-failure handling: the topic saves, the banner states the real reason
- [ ] `ARCHITECTURE.md` gains the add-topic-with-image data flow

## Phase 11 — e2e, a11y, docs

- [ ] Playwright covering the full flow, using the phase 3 seed user
- [ ] Accessibility pass against DESIGN.md section 6
- [ ] All 21 screens from `design-reference.html` present
- [ ] `README.md` and `ARCHITECTURE.md` final
