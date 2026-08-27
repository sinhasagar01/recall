# Recall

A personal learning library. Save something you just learned, find it again
later, practise it from memory, see what's weak, review.

It is not an LMS, a quiz platform or a SaaS product. It has one user.

- `DESIGN.md` — tokens, component contracts, behaviour and copy rules
- `design-reference.html` — the visual contract, 21 screens behind a tab bar
- `ARCHITECTURE.md` — layer rules and the four test layers
- `TASKS.md` — phase checklists and pinned tool versions

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS **v4**
(CSS-first, no `tailwind.config.js`) · Supabase for Postgres, Auth and Storage.

Supabase is the entire backend. No ORM, no client state library, no separate API
server.

## Setup

```bash
npm install
```

Start the local Supabase stack (needs Docker running):

```bash
supabase start
```

Copy the env template and fill it from the stack:

```bash
cp .env.example .env.local
```

`supabase start` prints the values; `supabase status` re-prints them.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL`, e.g. `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY`, an `sb_publishable_…` value |

This Supabase CLI no longer emits `anon` / `service_role` keys, so there is no
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never give a secret key a `NEXT_PUBLIC_` prefix.

Then:

```bash
npm run dev
```

## Tests

```bash
npm run verify
```

That is the whole gate: typecheck, then all four test layers.

| Command | What it runs |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — domain (node) and component (jsdom) projects |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:db` | pgTAP against the local stack |
| `npm run test:e2e` | Playwright against `next dev` |
| `npm run verify` | all of the above, in that order |

`test:db` needs the Supabase stack running; it says so and exits if it is not.
`test:e2e` starts `next dev` itself, and reuses one that is already running.

See `ARCHITECTURE.md` for what belongs in each layer.
