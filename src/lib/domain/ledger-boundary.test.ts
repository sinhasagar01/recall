import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEDGER_COLUMNS } from '@/lib/domain/ledger'
import { demonstrationOf } from '@/lib/domain/phases'
import { orderForPractice, noShuffle } from '@/lib/domain/practice-selection'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * A ledger item never reaches the queue, and never reaches `demonstrated`.
 *
 * Two boundaries, not one, and the second is specific to this arc.
 *
 * The fourth in the line: secret-key-boundary → evidence-boundary →
 * sources-boundary → phases-boundary → this. Four arcs, one queue boundary, four
 * directions.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * Listed explicitly rather than globbed, so adding one is a deliberate act — the
 * same list the three earlier boundary tests guard.
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

describe('the ledger never reaches the queue', () => {
  it('is not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return LEDGER_COLUMNS.filter((column) => source.includes(column)).map(
        (column) => `${file} names ${column}`,
      )
    })

    expect(offenders).toEqual([])
  })

  it('is not named in the practice or weak SQL', () => {
    const migrations = join(ROOT, 'supabase', 'migrations')
    const offenders = readdirSync(migrations)
      .filter((file) => /practice|weak/.test(file))
      .flatMap((file) => {
        const source = readFileSync(join(migrations, file), 'utf8')
        return LEDGER_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('does not change the practice order', () => {
    const bare = makeTopic({ id: 'a', title: 'A', confidence: 'weak', last_practiced_at: null })
    const ledgered = makeTopic({ id: 'b', title: 'B', confidence: 'weak', last_practiced_at: null })

    expect(orderForPractice([bare, ledgered], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
    expect(orderForPractice([ledgered, bare], { shuffle: noShuffle }).map((t) => t.id)).toEqual([
      'b',
      'a',
    ])
  })
})

describe('the ledger never contributes to demonstrated', () => {
  /**
   * The rule this arc most needs to keep, and the reason it is asserted on the
   * SOURCE rather than on an outcome.
   *
   * The product cannot know whether you shipped what a URL points at. A rule that
   * counted ledger items toward demonstrated would be a rule you could satisfy
   * with a bookmark — so the ledger line on a capability is context, never a
   * third half.
   */
  it('is not named in the module that decides demonstrated', () => {
    const phases = readFileSync(join(SRC, 'lib/domain/phases.ts'), 'utf8')

    const offenders = LEDGER_COLUMNS.filter((column) => phases.includes(column))
    expect(
      offenders,
      'phases.ts must not be able to name the ledger — that is what makes "the ledger is context" structural',
    ).toEqual([])
  })

  it('cannot be passed to demonstrationOf at all', () => {
    /*
      The structural half. `demonstrationOf` takes `Topic[]` and nothing else, so
      there is no parameter a ledger item could arrive through — the same
      "unexpressible rather than forbidden" argument the whole project prefers.

      ── Why this reads the source rather than the arity ─────────────────────
      The first version of this asserted `expect(demonstrationOf).toHaveLength(1)`
      and was worthless: `Function.length` does not count parameters with
      defaults, so `demonstrationOf(linked, ledger = [])` — the exact widening
      this exists to catch — has length 1 and passed. Found by perturbing it.

      The signature in the source is the thing that actually changes, so that is
      what is asserted.
    */
    const phases = readFileSync(join(SRC, 'lib/domain/phases.ts'), 'utf8')

    expect(
      phases,
      'demonstrationOf must take the linked topics and nothing else',
    ).toContain('export function demonstrationOf(linked: Topic[]): Demonstration {')

    // Belt: the runtime arity still has to agree with that signature.
    expect(demonstrationOf).toHaveLength(1)
  })

  it('leaves demonstrated unchanged whatever the ledger holds', () => {
    /*
      Behavioural belt to the structural braces. Two capabilities with identical
      topics are identically demonstrated; the ledger cannot enter the
      computation, so there is nothing to vary here but the topics.
    */
    const recallOnly = [makeTopic({ confidence: 'okay' })]
    const both = [makeTopic({ confidence: 'okay', rebuild_at: '2026-09-01' })]

    expect(demonstrationOf(recallOnly).demonstrated).toBe(false)
    expect(demonstrationOf(both).demonstrated).toBe(true)

    // And the shape it returns has no room for a ledger count.
    expect(Object.keys(demonstrationOf(both))).not.toContain('ledger')
    expect(Object.keys(demonstrationOf(both))).not.toContain('items')
  })
})
