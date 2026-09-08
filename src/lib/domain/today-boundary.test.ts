import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TODAY_COLUMNS } from '@/lib/domain/today'
import { orderForPractice, noShuffle } from '@/lib/domain/practice-selection'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * A day never reaches the queue, and opening Today never writes.
 *
 * Two boundaries. The first is the one every arc has held — five arcs, one queue
 * boundary, five directions: secret-key → evidence → sources → phases → ledger →
 * this. The second is specific to Today and is the reason it can promise that a
 * day you never wrote on leaves no trace.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * Listed explicitly rather than globbed, so adding one is a deliberate act — the
 * same list the four earlier boundary tests guard.
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

describe('a day never reaches the queue', () => {
  it('is not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return TODAY_COLUMNS.filter((column) => source.includes(column)).map(
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
        return TODAY_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('does not change the practice order', () => {
    const a = makeTopic({ id: 'a', title: 'A', confidence: 'weak', last_practiced_at: null })
    const b = makeTopic({ id: 'b', title: 'B', confidence: 'weak', last_practiced_at: null })

    expect(orderForPractice([a, b], { shuffle: noShuffle }).map((t) => t.id)).toEqual(['a', 'b'])
    expect(orderForPractice([b, a], { shuffle: noShuffle }).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('opening Today writes nothing', () => {
  /**
   * The structural half of "a day with nothing typed has no row".
   *
   * Decision 4 called this structural, so it gets the same treatment as every
   * other structural claim in this project: it is asserted on the source, and it
   * has been seen to fail by adding an upsert to the page module.
   *
   * The read path is the page plus the data module. Every write in this arc lives
   * in actions.ts, behind explicit form submission — so if either of these two
   * files can name a write, the promise is no longer structural, whatever the
   * code happens to do today.
   */
  const READ_PATH = ['app/(app)/today/page.tsx', 'lib/data/today.ts']

  /*
    The PostgREST verbs that create or change rows. `.select` and `.order` are
    absent on purpose — those are the reads this path is made of.
  */
  const WRITES = ['.insert(', '.upsert(', '.update(', '.delete(', '.rpc(']

  it('has no write anywhere on the read path', () => {
    const offenders = READ_PATH.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return WRITES.filter((verb) => source.includes(verb)).map(
        (verb) => `${file} calls ${verb}`,
      )
    })

    expect(
      offenders,
      'opening Today must not be able to write — a day you never typed on is not a day you failed',
    ).toEqual([])
  })

  it('keeps every write in the actions file, so there is somewhere for them to be', () => {
    /*
      Guard the guard. If the writes moved somewhere else entirely, the assertion
      above would still pass while asserting nothing — the same empty-set failure
      that arc 4 found in five shipped specs at once.
    */
    const actions = readFileSync(join(SRC, 'app/(app)/today/actions.ts'), 'utf8')

    expect(actions, 'the writes must exist somewhere, or the check above is vacuous').toContain(
      '.upsert(',
    )
    expect(actions).toContain('.update(')
  })
})
