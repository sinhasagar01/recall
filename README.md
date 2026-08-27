# Recall

A personal learning library. Save something the moment you understand it, find it
again later, try to explain it from memory, see what's weak, review.

One user. Not an LMS, not a quiz platform, not a SaaS product.

The loop: **learn → save → find → practise → see what's weak → review.**

- `DESIGN.md` — tokens, component contracts, behaviour and copy rules
- `design-reference.html` — the visual contract; open it and use the tab bar
- `ARCHITECTURE.md` — the layers, the boundaries, and every trap the build hit
- `TASKS.md` — the twelve phases, and what was deliberately not built

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 (CSS-first,
no `tailwind.config.js`) · Supabase for Postgres, Auth and Storage.

Supabase is the entire backend. No ORM, no client state library, no separate API
server. One table.

## Prerequisites

- **Node 22.18+** — the seed script is a `.mts` file run directly by Node
- **Docker**, running — the local Supabase stack is containers, and `supabase start`
  will not work without it
- **Supabase CLI** 2.116+

## Setup, from clone to running

```bash
npm install
```

```bash
supabase start
```

That prints the local credentials. It takes a few minutes the first time while Docker
pulls images.

```bash
cp .env.example .env.local
```

Fill `.env.local` from `supabase status`:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL`, e.g. `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY`, an `sb_publishable_…` value |
| `SUPABASE_SECRET_KEY` | `SECRET_KEY`, an `sb_secret_…` value. **Server only** |
| `E2E_*_USER_EMAIL` / `_PASSWORD` | anything; the seed script creates them |

This CLI version no longer emits `anon` / `service_role` keys, so there is no
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Never give a secret key a `NEXT_PUBLIC_` prefix** —
that ships it to the browser.

`.env.example` is committed with placeholders; `.env.local` is git-ignored and holds
the real values. Nothing else needs configuring.

```bash
npm run dev
```

Open http://localhost:3000, create an account, and add a topic.

## Tests

```bash
npm run verify
```

That is the whole gate: a typecheck, then all four test layers.

| Command | What it runs |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — the `domain` (node) and `components` (jsdom) projects |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:db` | pgTAP against the local stack |
| `npm run test:e2e` | seeds the fixture users, then Playwright against `next dev` |
| `npm run verify` | all of the above, in that order |
| `npm run seed:e2e` | the fixture users on their own |
| `npm run db:types` | regenerate `src/lib/database.types.ts` after a migration |

`test:db` needs the stack running and says so if it is not. `test:e2e` starts
`next dev` itself and reuses one already running.

See ARCHITECTURE.md for what belongs in each layer — the short version is that a rule
needing a database to test is in the wrong one.

## The seeded users

`npm run seed:e2e` creates four fixture accounts. Each exists so a specific state can
be tested without another spec's data getting in the way, and the seed resets them on
every run so a half-finished run cannot poison the next one.

| User | State | What it is for |
| --- | --- | --- |
| `E2E_USER_*` | accumulates topics | The general-purpose account. Specs create their own uniquely-titled topics and assert only on those, so the four Playwright workers never collide |
| `E2E_EMPTY_USER_*` | no topics, ever | The empty-library state. No spec writes to it, and the seed clears it, so leftovers cannot defeat the test |
| `E2E_FEW_USER_*` | exactly 2 topics | The too-few-to-practise state and its override. Two is below the practice minimum of three |
| `E2E_STRONG_USER_*` | 2 topics, okay and strong | "Nothing needs review", so the weak page's empty state is tested for the reason its copy gives rather than because the library is empty |

The seed also purges those users' storage folders: rows disappear with a
`supabase db reset`, objects do not.

## Known gaps

Deliberate, and listed in full with reasoning in TASKS.md. The ones worth knowing before
you use this:

- **No mobile navigation.** Below 860px the rail is hidden and nothing replaces it, so
  Practice, Weak topics and Sign out are unreachable on a phone. Adding a topic and
  searching still work. The reference has a mobile tab bar; it is not built.
- **`Cache-Control` on a session refresh is Next's, not the Supabase package's.** See
  ARCHITECTURE.md — `Expires` and `Pragma` arrive intact, `Cache-Control` is replaced.
- No password reset, no OAuth, no profile management. Email and password only.
- One image per topic. No cropping, editing or annotation.
