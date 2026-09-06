import { createClient } from '@supabase/supabase-js'
import { LOCAL_MODE_MAX } from '../src/lib/domain/library-paging'
import { CREDENTIALS, type Fixture } from './auth-state'

/**
 * What each fixture must look like for the specs to mean anything.
 *
 * ── If your spec depends on a fixture's shape, add its invariant here ────────
 * A spec that relies on a property nobody wrote down is relying on luck. Three of
 * the seven below were **silent** dependencies — `few` holding exactly the two
 * titles export.spec asserts by name, `strong` holding the two the export and weak
 * specs look for, `large` holding `Bulk topic 0007` — and they were found by
 * reading the specs during a post-mortem, not by anyone knowing they existed. Each
 * would have failed as a locator timeout in a spec that never mentions fixtures.
 *
 * That is the pattern this file exists to stop. See ARCHITECTURE.md, "A fixture
 * with no spread on a dimension cannot test that dimension" — this is the seventh
 * entry in that family and the first one that leaves a guard behind.
 *
 * Checked in global setup, immediately after seeding, so a violation aborts the
 * run with one sentence naming the broken invariant instead of a dozen unrelated
 * specs timing out on locators. At 785 rows on the general-purpose fixture,
 * thirteen specs across a11y, image, library and quiz failed together — none of
 * which mentions a fixture size anywhere.
 */

interface Invariant {
  fixture: Fixture
  /** Stated as the thing that must be true, so the failure message reads as one. */
  must: string
  /** Which spec falls over when it is not. Names the cost of the violation. */
  reliedOnBy: string
  holds: (library: { titles: string[]; count: number }) => boolean
}

const has =
  (...titles: string[]) =>
  (library: { titles: string[] }) =>
    titles.every((title) => library.titles.some((existing) => existing.includes(title)))

export const INVARIANTS: Invariant[] = [
  {
    fixture: 'main',
    must: `hold at most ${LOCAL_MODE_MAX} topics, so the library is read whole rather than a page at a time`,
    reliedOnBy: 'everything that expects a seeded row to be on the first page',
    holds: ({ count }) => count <= LOCAL_MODE_MAX,
  },
  {
    fixture: 'main',
    must: 'hold the two backdated topics, so the library has a date spread',
    reliedOnBy: 'library.spec.ts — "a topic you just saved is the first card"',
    holds: has('Cascade layers', 'The paint holding timeout'),
  },
  {
    fixture: 'main',
    must: 'hold both seeded quizzes',
    reliedOnBy: 'quiz.spec.ts',
    holds: has(
      'Does a transform on a parent create a stacking context?',
      'What runs first — a resolved promise or a zero-delay timeout?',
    ),
  },
  {
    fixture: 'few',
    must: 'hold exactly two topics, "Specificity" and "The event loop"',
    reliedOnBy: 'export.spec.ts — asserts the count and both titles; practice.spec.ts needs it below the practice minimum',
    holds: ({ titles, count }) =>
      count === 2 && has('Specificity', 'The event loop')({ titles }),
  },
  {
    fixture: 'strong',
    must: 'hold "Flexbox main axis" and "Stacking contexts"',
    reliedOnBy: 'export.spec.ts (isolation) and weak.spec.ts (the stale list)',
    holds: has('Flexbox main axis', 'Stacking contexts'),
  },
  {
    fixture: 'large',
    must: `hold more than ${LOCAL_MODE_MAX} topics including "Bulk topic 0007", so the library is read through SQL`,
    reliedOnBy: 'library-paging.spec.ts — the only coverage of server mode',
    holds: ({ titles, count }) => count > LOCAL_MODE_MAX && has('Bulk topic 0007')({ titles }),
  },
  {
    fixture: 'empty',
    must: 'hold no topics at all',
    reliedOnBy: 'weak.spec.ts and settings.spec.ts — the empty states',
    holds: ({ count }) => count === 0,
  },
]

/**
 * Reads each fixture once and checks every invariant against it.
 *
 * Uses the secret key, like the seed, because it reads across users. Never runs in
 * a browser and never inside a spec.
 */
export async function checkFixtureInvariants(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !secretKey) {
    throw new Error(
      'Fixture check needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Neither is set.',
    )
  }

  const admin = createClient(url, secretKey, { auth: { persistSession: false } })

  /*
    Through the GoTrue admin API, not `.schema('auth')` — PostgREST does not expose
    the auth schema and returns "Invalid schema: auth". This is the same route the
    seed takes to resolve a fixture's id.
  */
  const { data: accounts, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(`Fixture check could not list users: ${listError.message}`)

  const idFor = new Map(accounts.users.map((user) => [user.email, user.id]))
  const fixtures = [...new Set(INVARIANTS.map((invariant) => invariant.fixture))]

  const libraries = new Map<Fixture, { titles: string[]; count: number }>()
  for (const fixture of fixtures) {
    const id = idFor.get(CREDENTIALS[fixture].email)
    if (!id) throw new Error(`Fixture user "${fixture}" does not exist. Run: npm run seed:e2e`)

    const { data, error, count } = await admin
      .from('topics')
      .select('title', { count: 'exact' })
      .eq('user_id', id)

    if (error) throw new Error(`Fixture check could not read ${fixture}: ${error.message}`)
    libraries.set(fixture, { titles: (data ?? []).map((row) => row.title), count: count ?? 0 })
  }

  const broken = INVARIANTS.filter(
    (invariant) => !invariant.holds(libraries.get(invariant.fixture)!),
  )

  if (broken.length === 0) return

  /*
    Deliberately verbose. The whole point is that the previous failure mode was a
    dozen locator timeouts in specs that never mention fixtures, so this message
    has to say what is wrong, what depends on it, and what to do about it.
  */
  const report = broken
    .map((invariant) => {
      const library = libraries.get(invariant.fixture)!
      return [
        `  ✗ "${invariant.fixture}" must ${invariant.must}`,
        `      it currently holds ${library.count} topics`,
        `      relied on by: ${invariant.reliedOnBy}`,
      ].join('\n')
    })
    .join('\n\n')

  throw new Error(
    `\n\nFixture invariants are broken — aborting before any spec runs.\n\n${report}\n\n` +
      `Run \`npm run seed:e2e\` to reset the fixtures. If seeding did run and this still\n` +
      `fails, the seed and this file disagree and one of them is wrong.\n`,
  )
}
