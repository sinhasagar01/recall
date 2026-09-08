/**
 * A lesson's length: free text in, whole seconds out.
 *
 * You read a number off a video player and type it however you read it. The
 * store is seconds so lengths can be summed across a chapter and a course, and
 * the form echoes the parse back in the breadcrumb **before** you save — which
 * is what makes a permissive parser safe rather than reckless.
 *
 * Pure. No clock, and nothing here formats for a locale.
 *
 * ── What it refuses, and why refusing is the point ──────────────────────────
 * A length that silently becomes **zero** is worse than one left empty: empty is
 * absent and reads as absent, whereas zero is a lesson that took no time, summed
 * into a course total as though it were a fact. So nonsense is an error the form
 * shows, never a number the database keeps.
 */

/** Seconds, or the reason it could not be read. Empty input is neither. */
export type ParsedDuration =
  | { seconds: number; error?: undefined }
  | { seconds?: undefined; error: string }

const NOT_A_LENGTH = 'Not a length. Try 13m 23s, 1:12:04, or 90 for 90 minutes.'

/**
 * The shapes accepted, in the order they are tried.
 *
 * | input      | seconds | why |
 * | ---------- | ------- | --- |
 * | `13m 23s`  | 803     | unit-suffixed |
 * | `1h 30m`   | 5400    | unit-suffixed |
 * | `1:12:04`  | 4324    | h:mm:ss |
 * | `7:30`     | 450     | mm:ss — the shorter colon form is minutes and seconds |
 * | `90`       | 5400    | **a bare number is MINUTES** |
 * | `0`, `-5`  | error   | not zero |
 * | `banana`   | error   | |
 *
 * A bare number is minutes because that is the number printed on a player, and
 * because the breadcrumb shows "1h 30m" back before you press Save. The
 * alternative reading — seconds — makes the common case wrong sixty times over.
 */
export function parseDuration(input: string): ParsedDuration | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null

  // ── h:mm:ss and mm:ss ────────────────────────────────────────────────────
  if (text.includes(':')) {
    const parts = text.split(':')
    if (parts.length > 3) return { error: NOT_A_LENGTH }
    if (!parts.every((part) => /^\d+$/.test(part.trim()))) return { error: NOT_A_LENGTH }

    const numbers = parts.map((part) => Number(part.trim()))
    /*
      Two parts is mm:ss, three is h:mm:ss. Reading "7:30" as seven HOURS thirty
      would be the same class of mistake as reading a bare number as seconds, in
      the other direction.
    */
    const seconds =
      numbers.length === 3
        ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
        : numbers[0] * 60 + numbers[1]

    return seconds > 0 ? { seconds } : { error: NOT_A_LENGTH }
  }

  // ── unit-suffixed: 1h 30m 20s, 13m23s, 45s ───────────────────────────────
  const units = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/g)]
  if (units.length > 0) {
    /*
      Every character has to be accounted for. "13m of nonsense" would otherwise
      parse as 13 minutes and quietly drop the rest, and a parser that ignores
      what it does not understand is how a typo becomes a stored number.
    */
    if (text.replace(/(\d+(?:\.\d+)?)\s*([hms])/g, '').trim() !== '') {
      return { error: NOT_A_LENGTH }
    }

    const perUnit: Record<string, number> = { h: 3600, m: 60, s: 1 }
    const seconds = units.reduce(
      (total, [, value, unit]) => total + Number(value) * perUnit[unit],
      0,
    )

    return seconds > 0 ? { seconds: Math.round(seconds) } : { error: NOT_A_LENGTH }
  }

  // ── a bare number, which is minutes ──────────────────────────────────────
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const seconds = Math.round(Number(text) * 60)
    return seconds > 0 ? { seconds } : { error: NOT_A_LENGTH }
  }

  return { error: NOT_A_LENGTH }
}

/**
 * Seconds back into something a person reads.
 *
 * `13m 23s`, `1h 12m`, `45s`. Hours drop the seconds — nobody needs to know a
 * course is 4h 12m 07s, and the extra precision makes a total harder to scan.
 */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return rest > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${minutes}m`
  return `${rest}s`
}

/** A chapter's or a course's total, skipping the lessons with no length. */
export function totalDuration(seconds: (number | null)[]): number | null {
  const known = seconds.filter((value): value is number => value !== null && value > 0)
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
}
