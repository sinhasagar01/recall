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

Open http://localhost:3000 and create an account.

Sign-up sends a confirmation email, and locally that email goes to **Mailpit**, not to a
real inbox. Open http://127.0.0.1:54324, click the message, follow its link, and you land
on the library signed in. Password resets arrive the same way. Nothing else needs
configuring — the local stack runs its own SMTP catcher.

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
| `npm run gen:parity` | regenerate the library parity test; `-- --check` fails if stale |
| `npm run sweep:orphans` | list storage objects no topic points at; `-- --delete` to remove them |
| `npm run db:types` | regenerate `src/lib/database.types.ts` after a migration |
| `supabase config push` | apply `[remotes.production]` to the hosted project (see below) |

`test:db` needs the stack running and says so if it is not. `test:e2e` starts
`next dev` itself and reuses one already running.

See ARCHITECTURE.md for what belongs in each layer — the short version is that a rule
needing a database to test is in the wrong one.

## Production configuration

Production auth settings — site URL, redirect allow-list, whether sign-up is open,
rate limits, SMTP — live in the `[remotes.production]` block at the end of
`supabase/config.toml`, not in the dashboard.

`config push` applies the **merged** config, so a field the block does not name gets the
local value, not the dashboard's. The local rate limits are raised for the test suite and
would be actively harmful in production; they are overridden for that reason.

The SMTP password is the one thing not in the repo:

```bash
export SUPABASE_AUTH_SMTP_PASSWORD='<the Resend API key>'
supabase config push
```

Check the output says `Loading config override: [remotes.production]`. Without that line
the override did not apply and the local values went up — a `project_id` that matches
nothing fails silently.

## The seeded users

`npm run seed:e2e` creates five fixture accounts. Each exists so a specific state can
be tested without another spec's data getting in the way, and the seed resets them on
every run so a half-finished run cannot poison the next one.

| User | State | What it is for |
| --- | --- | --- |
| `E2E_USER_*` | reset each run | The general-purpose account. Specs create their own uniquely-titled topics and assert only on those, so the four Playwright workers never collide |
| `E2E_EMPTY_USER_*` | no topics, ever | The empty-library state. No spec writes to it, and the seed clears it, so leftovers cannot defeat the test |
| `E2E_FEW_USER_*` | exactly 2 topics | The too-few-to-practise state and its override. Two is below the practice minimum of three |
| `E2E_STRONG_USER_*` | 2 topics, okay and strong | "Nothing needs review", so the weak page's empty state is tested for the reason its copy gives rather than because the library is empty |
| `E2E_LARGE_USER_*` | 501 topics | One more than the library sends whole, which is the smallest library that is definitely read through SQL. Both reading modes are covered end to end |

The seed also purges those users' storage folders: rows disappear with a
`supabase db reset`, objects do not.

## Known gaps

Tracked as [GitHub issues](https://github.com/sinhasagar01/recall/issues) rather than
listed here, so there is one place to look. Labels say when each one matters:
`blocks-multiuser`, `blocks-public`, `scale`, `billing`, `tech-debt`.

One is worth knowing before you use this:

- **A practice session scans your whole backlog to pick ten.** Not a bug and not
  fixable: choosing ten at random from a group of equally-stale topics has to consider
  all of them. It happens inside Postgres now rather than by shipping every topic to the
  browser — 20,000 topics take about 25ms and ten rows cross the wire.

Deliberately out of scope, and not going to change: email and password only — no OAuth,
no profile management. One image per topic, no cropping or annotation. No spaced
repetition, scoring, streaks or analytics. One table.
