import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHASE_COLUMNS } from '@/lib/domain/phases'
import { orderForPractice, noShuffle } from '@/lib/domain/practice-selection'
import { libraryCounts } from '@/lib/domain/library-counts'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * A phase and a capability never reach the queue.
 *
 * Neither is practised, neither has a confidence, and neither may appear in the
 * practice queue or on the weak page. This is the failure mode for the arc: the
 * moment the queue can see a `capability_id`, "what I am trying to become able to
 * do" is one join away from being something you get asked to recall — and a
 * capability is a sentence about the future, not a thing you can be graded on.
 *
 * Asserted on the SOURCE, not on an outcome, for the reason the evidence arc
 * recorded: an outcome test passes right up until someone adds a tie-break, and
 * then keeps passing for a while. This fails on the mere *mention* of a phase or
 * capability column in a module that has no business knowing either exists.
 *
 * ── Why this can be absolute ────────────────────────────────────────────────
 * `capability_id` exists on the `topics` row and is deliberately NOT on the
 * domain `Topic` — omitted from `TopicRow` the way `search_text` and `source_id`
 * are. If it were on the domain type, `TopicBoundaryIsSound` would demand every
 * read return it, including `practice_ordered_page`, and this test would need an
 * exception carved out for the one module it most needs to cover.
 *
 * The third in the line: secret-key-boundary → evidence-boundary →
 * sources-boundary → this.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * Listed explicitly rather than globbed, so adding one is a deliberate act. The
 * same list `evidence-boundary.test.ts` and `sources-boundary.test.ts` guard —
 * three arcs protecting one boundary from three directions.
 */
const QUEUE_MODULES = [
  'lib/domain/practice-selection.ts',
  'lib/domain/practice-session.ts',
  'lib/domain/confidence.ts',
  'lib/domain/library-counts.ts',
  'lib/data/practice.ts',
  'app/(practice)/practice/page.tsx',
  'app/(app)/weak/page.tsx',
]

describe('phases and capabilities never reach the queue', () => {
  it('are not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return PHASE_COLUMNS.filter((column) => source.includes(column)).map(
        (column) => `${file} names ${column}`,
      )
    })

    expect(offenders).toEqual([])
  })

  it('are not named in the practice or weak SQL', () => {
    /*
      The ordering runs in SQL, so the TypeScript check above would miss a join
      added to the query — which is exactly how a capability would arrive in a
      practice session.
    */
    const migrations = join(ROOT, 'supabase', 'migrations')
    const offenders = readdirSync(migrations)
      .filter((file) => /practice|weak/.test(file))
      .flatMap((file) => {
        const source = readFileSync(join(migrations, file), 'utf8')
        return PHASE_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('is not on the domain Topic at all, which is what makes the rule absolute', () => {
    /*
      The structural half, and the load-bearing one. `toTopic` spreads the row, so
      a `capability_id` present at runtime is harmless — but the domain type must
      not carry it, or every read would be obliged to return it and the two
      assertions above would need an exception written into them.
    */
    const mapping = readFileSync(join(SRC, 'lib/data/topic-mapping.ts'), 'utf8')
    expect(mapping, 'TopicRow must omit capability_id, the way it omits source_id').toMatch(
      /Omit<[\s\S]*?'capability_id'/,
    )

    const types = readFileSync(join(SRC, 'lib/domain/types.ts'), 'utf8')
    expect(types, 'the domain Topic must not declare capability_id').not.toMatch(
      /^\s*capability_id/m,
    )
  })

  it('does not change the practice order', () => {
    const bare = makeTopic({ id: 'a', title: 'A', confidence: 'weak', last_practiced_at: null })
    const capable = makeTopic({ id: 'b', title: 'B', confidence: 'weak', last_practiced_at: null })

    // Both orderings, so a tie-break in either direction moves something — the
    // lesson from the evidence arc's vacuous ordering assertion.
    expect(orderForPractice([bare, capable], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
    expect(orderForPractice([capable, bare], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('does not change any library count', () => {
    const now = new Date('2026-09-09T12:00:00.000Z')
    const topics = [makeTopic({ id: 'a', confidence: 'weak' })]

    expect(libraryCounts(topics, {}, now)).toEqual(libraryCounts(topics, {}, now))
    expect(Object.keys(libraryCounts(topics, {}, now))).not.toContain('byCapability')
    expect(Object.keys(libraryCounts(topics, {}, now))).not.toContain('byPhase')
  })
})
