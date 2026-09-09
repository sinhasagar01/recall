#!/usr/bin/env node
/**
 * Apply a list of exact-match edits to one file, atomically.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Three times in one session an ad-hoc edit script did the same thing: assert
 * that each pattern matches exactly once, apply the replacements in memory, and
 * write at the very END. When a later assertion threw, the process died with the
 * earlier — correct — edits still unwritten, having already printed a line
 * saying they had been applied.
 *
 * That is the worst of both. An assertion that passed did not take effect, and
 * the output said it did. The first two instances produced a false reading; the
 * third shipped a visible defect — eight pips on a two-problem round, live, past
 * a green suite and past a type check.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * **Either every edit is written as it succeeds, or nothing is written at all.**
 * Batching a write behind an assertion that has already passed is the one
 * arrangement that can report success for work that never happened.
 *
 * This takes the second option, because a file half-edited is worse than a file
 * untouched: every pattern is checked against the ORIGINAL text first, and only
 * once all of them match does anything reach disk. A failure leaves the file
 * exactly as it was and says which pattern failed and how many times it matched.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node scripts/edit.mjs <file> <edits.json>
 *
 * where edits.json is `[{ "old": "...", "new": "..." }, ...]`. Every `old` must
 * match exactly once, and the text must actually change — a no-op edit is a
 * pattern that found what it wanted and asked for nothing, which is a mistake
 * worth failing on rather than a success.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [file, editsPath] = process.argv.slice(2)
if (!file || !editsPath) {
  console.error('usage: node scripts/edit.mjs <file> <edits.json>')
  process.exit(2)
}

const original = readFileSync(file, 'utf8')
const edits = JSON.parse(readFileSync(editsPath, 'utf8'))

/* Every pattern checked against the ORIGINAL, before anything is applied. */
const failures = []
for (const [index, { old, new: next }] of edits.entries()) {
  const count = original.split(old).length - 1
  if (count !== 1) failures.push(`edit ${index}: matched ${count} times, expected 1 — ${preview(old)}`)
  if (old === next) failures.push(`edit ${index}: old and new are identical — ${preview(old)}`)
}

if (failures.length > 0) {
  console.error(`${file}: NOTHING WRITTEN\n${failures.map((f) => `  ${f}`).join('\n')}`)
  process.exit(1)
}

let updated = original
for (const { old, new: next } of edits) updated = updated.replace(old, next)

/* The file changed, or the whole run is a lie. */
if (updated === original) {
  console.error(`${file}: NOTHING WRITTEN — every pattern matched and the text is unchanged`)
  process.exit(1)
}

writeFileSync(file, updated)
console.log(`${file}: ${edits.length} edit${edits.length === 1 ? '' : 's'} applied`)

function preview(text) {
  const line = text.split('\n')[0]
  return line.length > 60 ? `${line.slice(0, 60)}…` : line
}
