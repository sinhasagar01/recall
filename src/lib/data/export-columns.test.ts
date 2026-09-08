import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'

/**
 * `library.json` promises "every column, not a summary". Nothing checked it.
 *
 * `export.ts` selects topics by a hand-written string. A column added to
 * `topics` and to the domain `Topic` does NOT appear in that string, and nothing
 * fails — the export quietly stops keeping its promise while both the promise
 * and the tests around it stay green.
 *
 * `TopicBoundaryIsSound` does not cover this. It guards the generated row
 * against the domain type; it has nothing to say about a hand-written SELECT
 * string, which is a third shape neither side knows about.
 *
 * ── Found by adding a column, not by review ─────────────────────────────────
 * Arc 6 added `topics.extracted`. The compiler stopped the build until the
 * domain type accounted for it, the pgTAP `columns_are` stopped the suite until
 * the schema test did, and the export said nothing at all — so this assertion
 * was written and seen RED on `extracted` before `COLUMNS` was touched. A guard
 * written green is a guard nobody has watched work.
 *
 * ── Why the fixture is the source of truth ──────────────────────────────────
 * `keyof TopicRow` does not exist at runtime. `makeTopic` and `makeQuiz` return
 * a fully-populated `TopicRecord` and `Quiz`, and the compiler already obliges
 * them to carry every field — so their keys ARE the domain shape, at runtime,
 * maintained by a check that already exists rather than by a second list.
 */

const EXPORT = join(process.cwd(), 'src', 'lib', 'data', 'export.ts')

/** The topic SELECT string, read from the module rather than restated here. */
function exportedColumns(): string[] {
  const source = readFileSync(EXPORT, 'utf8')
  const match = source.match(/const COLUMNS\s*=\s*\n?\s*'([^']+)'/)

  if (match === null) {
    throw new Error(
      'Could not find the COLUMNS string in export.ts. This assertion is broken, ' +
        'not passing — fix the anchor rather than deleting the test.',
    )
  }

  return match[1].split(',').map((column) => column.trim())
}

/** Every field the domain Topic carries, on either arm. */
function domainColumns(): string[] {
  return [...new Set([...Object.keys(makeTopic({})), ...Object.keys(makeQuiz({}))])].sort()
}

describe('the export selects every column the domain Topic carries', () => {
  it('omits nothing', () => {
    const missing = domainColumns().filter((column) => !exportedColumns().includes(column))

    expect(
      missing,
      'library.json promises "every column, not a summary" — these would be silently absent',
    ).toEqual([])
  })

  it('invents nothing', () => {
    /*
      The other direction, and it is not symmetry for its own sake: a column in
      the string that the domain does not have is either a typo, which fails the
      query at runtime, or `search_text`, which topic-mapping.ts deliberately
      omits and which would be a lot of generated text in every export.
    */
    const extra = exportedColumns().filter((column) => !domainColumns().includes(column))

    expect(extra, 'the export names a column the domain Topic does not have').toEqual([])
  })
})
