import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PARITY_SQL, PARITY_SQL_PATH } from '@/lib/domain/__fixtures__/build-parity-sql'

/**
 * The domain half of the local/server parity contract.
 *
 * supabase/tests/library_parity_test.sql holds the expected rows and counts for
 * every filter combination, computed by running filterTopics and libraryCounts
 * over the shared corpus. pgTAP asserts the SQL reproduces them.
 *
 * That only proves anything while the committed expectations still describe the
 * domain. Change a domain rule and the pgTAP file becomes a record of what the
 * domain used to do — SQL would keep agreeing with a stale specification, and both
 * layers would look green while the app had changed underneath them.
 *
 * So this asserts the committed file is exactly what the domain produces today.
 * Together the two are a closed loop: domain == committed expectations == SQL.
 */
describe('library parity expectations', () => {
  it('match what the domain produces today', () => {
    const committed = readFileSync(PARITY_SQL_PATH, 'utf8')

    expect(
      committed,
      'The generated parity test no longer matches the domain. If a domain rule changed on purpose, run `npm run gen:parity` and check the diff — it is the list of behaviour that changed.',
    ).toBe(PARITY_SQL)
  })
})
