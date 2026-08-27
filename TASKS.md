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

- [ ] pgTAP tests for the `topics` columns, defaults and check constraints — **written first**
- [ ] pgTAP tests for the `updated_at` trigger
- [ ] pgTAP RLS tests: two users, user B can neither read nor write user A's rows
- [ ] pgTAP storage tests: user B cannot read or write user A's objects
- [ ] Migration: `topics` table, trigger, indexes on `(user_id, created_at desc)` and `(user_id, confidence)`
- [ ] Migration: RLS policies. `user_id` defaults to `auth.uid()`; clients never send it
- [ ] Migration: private `mental-models` bucket + policies on `(storage.foldername(name))[1]`

## Phase 2 — domain layer

- [ ] `practice-selection.ts` — never-practiced, then weak, then okay by longest gap, then strong by longest gap, then random. Session size 10, or everything if fewer
- [ ] Practice minimum of 3 topics, with an explicit override path
- [ ] `search-filter.ts` — partial, case-insensitive, across title, definition, mental_model, category, tags. `"recon"` finds `"React reconciliation"`
- [ ] `confidence.ts` — didn't know → weak, partly → okay, knew it → strong; each increments `practice_count` and sets `last_practiced_at`. Skip records nothing
- [ ] `category-suggest.ts` — keyword heuristic over title and definition. No AI API
- [ ] Every one of the above unit tested first, no UI

## Phase 3 — auth

- [ ] `src/lib/supabase/` — browser, server-component and middleware clients via `@supabase/ssr`
- [ ] Middleware refreshes the session cookie and guards `/library`, `/topic`, `/practice`, `/weak`
- [ ] Sign in and sign up screens (email + password only)
- [ ] **Seed script for a deterministic e2e test user.** Phase 11's Playwright specs need a
      known user to exist; the seed script must create it against the local stack. E2E must
      never depend on manually created data. Not phase 0 work — it needs the schema and auth

## Phase 4 — UI primitives

- [ ] Select (listbox: trigger + popover, counts, grouping, full keyboard support) — first
- [ ] ConfidenceMeter (fill count, not hue; `Never practiced` / `Weak` / `Okay` / `Strong`)
- [ ] The two registers — definition vs mental model
- [ ] Button, Field, Chip, Sheet, Modal, Toast, Skeleton
- [ ] Interaction-model tests (Vitest jsdom) for Select keyboard, Sheet/Modal focus trap and restore, ConfidenceMeter states

## Phase 5 — library and add topic

- [ ] Library: loaded, loading skeleton, empty, load error
- [ ] Add topic: form, saving, success toast
- [ ] The three-step insert → upload → patch seam, built before upload exists

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
