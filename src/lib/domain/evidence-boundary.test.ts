import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVIDENCE_COLUMNS } from '@/lib/domain/evidence'
import { orderForPractice, noShuffle } from '@/lib/domain/practice-selection'
import { libraryCounts } from '@/lib/domain/library-counts'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * Evidence is never an input to what the queue shows you.
 *
 * This is the failure mode for the whole feature. The moment practice selection,
 * practice ordering, the weak page or any count outside the topic itself reads an
 * evidence column, there are two confidence systems and the queue stops being one
 * rule that can be stated in a sentence.
 *
 * The rule is asserted on the SOURCE, not on an outcome, because an outcome test
 * passes right up until someone adds a tie-break and then passes for a while
 * longer. This fails on the mere mention of a column name in a module that has no
 * business knowing evidence exists.
 *
 * Modelled on src/lib/data/secret-key-boundary.test.ts, which does the same thing
 * for the admin client.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

// The nine column names come from the domain, so a rename cannot orphan this test.

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * Listed explicitly rather than globbed: the point is to name the places where
 * this would be a mistake, so that adding a new one is a deliberate act.
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

describe('evidence never reaches the queue', () => {
  it('is not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return EVIDENCE_COLUMNS.filter((column) => source.includes(column)).map(
        (column) => `${file} names ${column}`,
      )
    })

    expect(offenders).toEqual([])
  })

  it('is not named in the practice or weak SQL', () => {
    /*
      The ordering runs in SQL, so the TypeScript check above would miss a
      tie-break added to the query. These are the migrations that define what a
      session and the weak page contain.
    */
    const migrations = join(ROOT, 'supabase', 'migrations')
    const offenders = readdirSync(migrations)
      .filter((file) => /practice|weak/.test(file))
      .flatMap((file) => {
        const source = readFileSync(join(migrations, file), 'utf8')
        return EVIDENCE_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('does not change the practice order', () => {
    /*
      The outcome, alongside the source check. Two topics identical but for
      evidence must order the same either way — asserted by ordering the pair,
      then ordering it again with the evidence moved to the other topic.
    */
    const bare = makeTopic({ id: 'a', title: 'A', confidence: 'weak', last_practiced_at: null })
    const marked = makeTopic({
      id: 'b',
      title: 'B',
      confidence: 'weak',
      last_practiced_at: null,
      rebuild_at: '2026-08-28',
      rebuild_note: 'built it',
      challenge_at: '2026-09-01',
      challenge_note: 'solved it',
      production_at: '2026-09-04',
      production_note: 'shipped it',
    })

    const withEvidenceSecond = orderForPractice([bare, marked], { shuffle: noShuffle })
    const swapped = orderForPractice(
      [{ ...marked, id: 'a', title: 'A' }, { ...bare, id: 'b', title: 'B' }],
      { shuffle: noShuffle },
    )

    expect(withEvidenceSecond.map((topic) => topic.id)).toEqual(['a', 'b'])
    expect(swapped.map((topic) => topic.id)).toEqual(['a', 'b'])
  })

  it('does not change any library count', () => {
    const now = new Date('2026-09-07T12:00:00.000Z')
    const bare = makeTopic({ id: 'a', confidence: 'weak' })
    const marked = {
      ...bare,
      rebuild_at: '2026-08-28',
      rebuild_note: 'built it',
      production_at: '2026-09-04',
      production_note: 'shipped it',
    }

    expect(libraryCounts([marked], {}, now)).toEqual(libraryCounts([bare], {}, now))
  })
})
