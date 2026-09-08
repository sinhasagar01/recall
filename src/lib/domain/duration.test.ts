import { describe, expect, it } from 'vitest'
import { formatDuration, parseDuration, totalDuration } from '@/lib/domain/duration'

/*
  Every row of the table in duration.ts, plus the shapes that must NOT parse.

  The refusals matter more than the successes here. A length that silently
  becomes zero is worse than one left empty — empty reads as absent, zero reads
  as a lesson that took no time and is summed into a course total as a fact.
*/

const seconds = (input: string) => parseDuration(input)?.seconds
const error = (input: string) => parseDuration(input)?.error

describe('reading a length someone typed', () => {
  it('reads the unit-suffixed forms', () => {
    expect(seconds('13m 23s')).toBe(803)
    expect(seconds('13m23s')).toBe(803)
    expect(seconds('1h 30m')).toBe(5400)
    expect(seconds('1h 12m 04s')).toBe(4324)
    expect(seconds('45s')).toBe(45)
    expect(seconds('2H 5M')).toBe(7500)
  })

  it('reads the colon forms, and mm:ss is minutes', () => {
    expect(seconds('1:12:04')).toBe(4324)
    /*
      "7:30" is seven minutes thirty, not seven hours thirty. Reading the short
      colon form as hours would be the same mistake as reading a bare number as
      seconds, in the other direction.
    */
    expect(seconds('7:30')).toBe(450)
    expect(seconds('0:45')).toBe(45)
  })

  it('reads a bare number as MINUTES', () => {
    // The number printed on a video player. The breadcrumb echoes "1h 30m" back
    // before Save, so a misreading is visible rather than silent.
    expect(seconds('90')).toBe(5400)
    expect(seconds('13')).toBe(780)
  })

  it('treats empty as absent rather than as an error', () => {
    // The field is optional. Nothing typed is not a mistake.
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('   ')).toBeNull()
  })
})

describe('what it refuses, rather than storing as zero', () => {
  it('refuses zero in every shape it could arrive in', () => {
    expect(error('0')).toBeTruthy()
    expect(error('0s')).toBeTruthy()
    expect(error('0m 0s')).toBeTruthy()
    expect(error('0:00')).toBeTruthy()
    expect(error('0:00:00')).toBeTruthy()

    // And none of them slipped through as a number.
    for (const input of ['0', '0s', '0m 0s', '0:00', '0:00:00']) {
      expect(seconds(input), `${input} must not become a length`).toBeUndefined()
    }
  })

  it('refuses a negative', () => {
    expect(error('-5')).toBeTruthy()
    expect(seconds('-5')).toBeUndefined()
  })

  it('refuses nonsense, and says what to type instead', () => {
    expect(error('banana')).toContain('13m 23s')
    expect(error('about an hour')).toBeTruthy()
    expect(error('::')).toBeTruthy()
    expect(error('1:2:3:4')).toBeTruthy()
  })

  it('refuses a partly-readable string rather than keeping the readable half', () => {
    /*
      The dangerous case. "13m of nonsense" contains a valid "13m", and a lenient
      parser stores 780 seconds for a string its author clearly did not mean as a
      length. Everything has to be accounted for or nothing is.
    */
    expect(seconds('13m of nonsense')).toBeUndefined()
    expect(error('13m of nonsense')).toBeTruthy()
    expect(seconds('about 13m')).toBeUndefined()
  })
})

describe('showing a length back', () => {
  it('reads the way a person would say it', () => {
    expect(formatDuration(803)).toBe('13m 23s')
    expect(formatDuration(780)).toBe('13m')
    expect(formatDuration(45)).toBe('45s')
    // Hours drop the seconds: nobody needs 4h 12m 07s, and it is harder to scan.
    expect(formatDuration(4324)).toBe('1h 12m')
    expect(formatDuration(5400)).toBe('1h 30m')
  })

  it('has nothing to say about no length', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
  })

  it('round-trips what the parser produced', () => {
    for (const input of ['13m 23s', '1h 30m', '45s']) {
      const parsed = parseDuration(input)?.seconds
      expect(parsed).toBeDefined()
      expect(parseDuration(formatDuration(parsed!)!)?.seconds).toBe(parsed)
    }
  })
})

describe('adding lengths up', () => {
  it('sums what it has and ignores what it does not', () => {
    // A chapter where two lessons have a length and one does not is still worth
    // a total — it is just a total of what is known.
    expect(totalDuration([803, null, 780])).toBe(1583)
  })

  it('has no total when nothing has a length', () => {
    expect(totalDuration([])).toBeNull()
    expect(totalDuration([null, null])).toBeNull()
  })
})
