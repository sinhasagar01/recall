#!/usr/bin/env node
/**
 * The perturbation harness.
 *
 * Every constraint, policy and clause in this project is proven to bite by
 * removing it and watching a named assertion fail. That discipline is only worth
 * anything if the removal actually happened — a perturbation that silently failed
 * to apply reports "0 failed", which is indistinguishable from a redundant clause
 * and points the same way: "delete it".
 *
 * This existed as an ad-hoc script re-authored per arc, and it lied twice in two
 * arcs, both times about the arc's central guard. The cause was one line:
 *
 *     applied = (new in now) && (old not in now)     // WRONG
 *
 * `old not in now` only holds for a REPLACEMENT. An INSERTION — adding a
 * forbidden column before an anchor line — leaves its anchor in place, so the
 * predicate reported "not applied" for a perturbation that had applied perfectly.
 *
 * That is not bad luck about which cases it hit. The central guard of an arc is
 * usually "this column must not exist", and testing that requires an insertion,
 * which is exactly the edit shape the predicate mishandled. The instrument was
 * blind in precisely the place it was most needed.
 *
 * So verification here is exact rather than heuristic: the file after the edit
 * must equal `original.replace(old, new)` and must differ from the original.
 * Anything else throws. A perturbation that cannot be applied is an ERROR, never
 * a result.
 *
 * Usage:  node scripts/perturb.mjs <spec.json>
 *
 * Spec shape:
 *   {
 *     "file":    "supabase/migrations/….sql",   // the file to perturb
 *     "prepare": "supabase db reset --local",    // optional, run after each edit
 *     "verify":  "./scripts/test-db.sh …",       // the command whose failure is the signal
 *     "passMarker": "Result: PASS",              // its output means "did NOT bite"
 *     "failLinePattern": "^# Failed test",       // optional, lines to quote back
 *     "cases": [
 *       { "name": "…", "old": "…", "new": "…",
 *         "probe": "select …",                   // optional SQL, run via psql in docker
 *         "expect": "…" }                        // optional substring the probe must contain
 *     ]
 *   }
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const specPath = process.argv[2]
if (!specPath) {
  console.error('usage: node scripts/perturb.mjs <spec.json>')
  process.exit(2)
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'))
const original = readFileSync(spec.file, 'utf8')

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    // A non-zero exit is the normal case here — the verify command is expected
    // to fail when a perturbation bites.
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

const probeDb = (sql) =>
  run(
    `docker exec -i supabase_db_recall psql -U postgres -d postgres -tAc ${JSON.stringify(sql)}`,
  ).trim()

const results = []
let failures = 0

try {
  for (const [index, testCase] of spec.cases.entries()) {
    const label = testCase.name ?? `case ${index + 1}`

    // ── 1. The anchor must exist. Missing is an ERROR, never a data point. ──
    if (!original.includes(testCase.old)) {
      throw new Error(
        `[${label}] anchor not found in ${spec.file}.\n` +
          `This is a broken perturbation, not a passing one. Fix the anchor.\n` +
          `Looked for: ${JSON.stringify(testCase.old.slice(0, 120))}`,
      )
    }

    // ── 2. Apply, and verify EXACTLY. Works for replacements and insertions. ──
    const expected = original.replace(testCase.old, testCase.new)
    writeFileSync(spec.file, expected)
    const actual = readFileSync(spec.file, 'utf8')

    if (actual !== expected) {
      throw new Error(`[${label}] the file on disk does not match the intended edit.`)
    }
    if (actual === original) {
      throw new Error(
        `[${label}] the edit changed nothing — old and new are identical, so this ` +
          `perturbation could never bite and its result would be meaningless.`,
      )
    }

    // ── 3. Install it, and confirm it reached the database too. ──
    if (spec.prepare) run(spec.prepare)

    let installed = null
    if (testCase.probe) {
      installed = probeDb(testCase.probe)
      if (testCase.expect !== undefined && !installed.includes(testCase.expect)) {
        throw new Error(
          `[${label}] the edit is in the file but NOT in the database.\n` +
            `Probe returned ${JSON.stringify(installed)}, expected to contain ` +
            `${JSON.stringify(testCase.expect)}.\n` +
            `Postgres silently refuses some changes (create or replace cannot change a ` +
            `return type). Believing the file is how that becomes a false result.`,
        )
      }
    }

    // ── 4. Only now is the outcome meaningful. ──
    const output = run(spec.verify)
    const bit = !output.includes(spec.passMarker)
    if (!bit) failures += 1

    const pattern = new RegExp(spec.failLinePattern ?? '^# Failed test', 'm')
    const named = output
      .split('\n')
      .filter((line) => pattern.test(line.trim()))
      .map((line) => line.trim())

    results.push({ label, installed, bit, named })
  }
} finally {
  // Always restore, including on a thrown error.
  writeFileSync(spec.file, original)
  if (spec.prepare) run(spec.prepare)
}

for (const result of results) {
  const verdict = result.bit ? 'BIT' : 'DID NOT BITE'
  console.log(`${result.label.padEnd(44)} ${verdict}`)
  if (result.installed !== null) console.log(`    in db: ${result.installed.slice(0, 70)}`)
  for (const line of result.named.slice(0, 4)) console.log(`    ${line.slice(0, 100)}`)
}

console.log(
  `\n${results.length} perturbations, ${results.length - failures} bit, ${failures} did not.`,
)
console.log('A perturbation that did not bite needs an explanation: the clause is')
console.log('redundant, the test is missing, or it is unobservable given another rule.')
