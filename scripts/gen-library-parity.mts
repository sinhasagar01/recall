/**
 * Writes the local/server parity test, or checks that the committed one is current.
 *
 * All the work is in src/lib/domain/__fixtures__/build-parity-sql.ts, which the
 * Vitest suite imports too — so `npm test` and this script cannot disagree about
 * what the domain produces.
 *
 *   npm run gen:parity              # rewrite the generated test
 *   npm run gen:parity -- --check   # fail if it is stale (part of verify)
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { PARITY_SQL, PARITY_SQL_PATH } from '@/lib/domain/__fixtures__/build-parity-sql'

const check = process.argv.includes('--check')

const existing = (() => {
  try {
    return readFileSync(PARITY_SQL_PATH, 'utf8')
  } catch {
    return ''
  }
})()

if (!check) {
  writeFileSync(PARITY_SQL_PATH, PARITY_SQL)
  console.log(`Wrote ${PARITY_SQL_PATH}.`)
} else if (existing !== PARITY_SQL) {
  console.error(
    `${PARITY_SQL_PATH} is out of date — the domain no longer produces the committed expectations.\nRun: npm run gen:parity`,
  )
  process.exit(1)
} else {
  console.log(`${PARITY_SQL_PATH} is up to date.`)
}
