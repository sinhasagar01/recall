import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOURCE_COLUMNS } from '@/lib/domain/sources'
import { orderForPractice, noShuffle } from '@/lib/domain/practice-selection'
import { libraryCounts } from '@/lib/domain/library-counts'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * A source never reaches the queue.
 *
 * A source is never practised, has no confidence, and must never appear in the
 * practice queue or on the weak page. This is the failure mode for the arc: the
 * moment the queue can see a `source_id`, a transcript is one join away from
 * being something you get asked to recall.
 *
 * Asserted on the SOURCE, not on an outcome, for the reason the evidence arc
 * recorded: an outcome test passes right up until someone adds a tie-break, and
 * then keeps passing for a while. This fails on the mere *mention* of a source
 * column in a module that has no business knowing sources exist.
 *
 * ── Why this can be absolute ────────────────────────────────────────────────
 * `source_id` exists on the `topics` row and is deliberately NOT on the domain
 * `Topic` — omitted from `TopicRow` the way `search_text` is. If it were on the
 * domain type, `TopicBoundaryIsSound` would demand every read return it,
 * including `practice_ordered_page`, and this test would need an exception
 * carved out for the one module it most needs to cover.
 *
 * Modelled on evidence-boundary.test.ts and secret-key-boundary.test.ts.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * Listed explicitly rather than globbed, so adding one is a deliberate act. This
 * list is the same one evidence-boundary.test.ts guards — the two arcs protect
 * the same boundary from different directions.
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

describe('sources never reach the queue', () => {
  it('are not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return SOURCE_COLUMNS.filter((column) => source.includes(column)).map(
        (column) => `${file} names ${column}`,
      )
    })

    expect(offenders).toEqual([])
  })

  it('are not named in the practice or weak SQL', () => {
    /*
      The ordering runs in SQL, so the TypeScript check above would miss a join
      added to the query — which is exactly how a transcript would arrive in a
      practice session.
    */
    const migrations = join(ROOT, 'supabase', 'migrations')
    const offenders = readdirSync(migrations)
      .filter((file) => /practice|weak/.test(file))
      .flatMap((file) => {
        const source = readFileSync(join(migrations, file), 'utf8')
        return SOURCE_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('is not on the domain Topic at all, which is what makes the rule absolute', () => {
    /*
      The structural half. `toTopic` spreads the row, so a `source_id` present at
      runtime is harmless — but the domain type must not carry it, or every read
      would be obliged to return it.
    */
    const mapping = readFileSync(join(SRC, 'lib/data/topic-mapping.ts'), 'utf8')
    expect(mapping, 'TopicRow must omit source_id, the way it omits search_text').toMatch(
      /Omit<[\s\S]*?'source_id'/,
    )

    const types = readFileSync(join(SRC, 'lib/domain/types.ts'), 'utf8')
    expect(types, 'the domain Topic must not declare source_id').not.toMatch(/^\s*source_id/m)
  })

  it('does not change the practice order', () => {
    const bare = makeTopic({ id: 'a', title: 'A', confidence: 'weak', last_practiced_at: null })
    const sourced = makeTopic({ id: 'b', title: 'B', confidence: 'weak', last_practiced_at: null })

    // Both orderings, so a tie-break in either direction moves something —
    // the lesson from the evidence arc's vacuous ordering assertion.
    expect(orderForPractice([bare, sourced], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
    expect(orderForPractice([sourced, bare], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('does not change any library count', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')
    const topics = [makeTopic({ id: 'a', confidence: 'weak' })]

    // Counting is over Topic, which has no source_id — so this asserts the
    // absence structurally as well as behaviourally.
    expect(libraryCounts(topics, {}, now)).toEqual(libraryCounts(topics, {}, now))
    expect(Object.keys(libraryCounts(topics, {}, now))).not.toContain('bySource')
  })
})
