import { describe, expect, it } from 'vitest'
import { isRecalled, recallWrite } from '@/lib/domain/recall'
import { practiceUpdateFor } from '@/lib/domain/confidence'

const NOW = new Date('2026-09-18T10:00:00.000Z')
const topic = { practice_count: 3 }

describe('isRecalled', () => {
  it('is false for nothing, an empty string, and whitespace', () => {
    // A textarea someone tabbed through holds a newline, and that is not an
    // explanation either.
    expect(isRecalled(null)).toBe(false)
    expect(isRecalled(undefined)).toBe(false)
    expect(isRecalled('')).toBe(false)
    expect(isRecalled('   \n  ')).toBe(false)
  })

  it('is true for anything you actually wrote, however wrong', () => {
    // Being wrong is the point of keeping it.
    expect(isRecalled('something about scope? not sure')).toBe(true)
  })
})

describe('recallWrite', () => {
  it('produces both fields or neither, never one', () => {
    /*
      The pairing is the thing that can be false. A date without text, or text
      without a date, is the state that makes the page claim "this is what you
      said last time" about a different practice.
    */
    const written = recallWrite('a live reference to the scope', NOW)
    expect(written).toEqual({
      last_recall: 'a live reference to the scope',
      last_recall_at: NOW.toISOString(),
    })

    expect(recallWrite('', NOW)).toBeNull()
    expect(recallWrite(null, NOW)).toBeNull()
  })

  it('trims, because the stored thing is the words', () => {
    expect(recallWrite('  scope  ', NOW)?.last_recall).toBe('scope')
  })
})

describe('practiceUpdateFor, with an attempt', () => {
  it('writes the attempt alongside the grade, in one object', () => {
    // One write: recordPractice is a single UPDATE, so there is no ordering
    // question and no partial state.
    const update = practiceUpdateFor(topic, { kind: 'graded', grade: 'knew-it' }, NOW, 'scope')

    expect(update).toMatchObject({
      practice_count: 4,
      last_practiced_at: NOW.toISOString(),
      last_recall: 'scope',
      last_recall_at: NOW.toISOString(),
    })
  })

  it('an empty attempt contributes NO KEYS, so it cannot clear a stored one', () => {
    /*
      ── The rule this feature turns on ────────────────────────────────────
      An empty attempt is the absence of an explanation, not a new one.

      The distinction is between an update with no `last_recall` key and one with
      `last_recall: null`. The second is a write that CLEARS what you wrote last
      time, and revealing without typing is not a reason to lose it. Asserted on
      the keys rather than the values, because `undefined` and absent look the
      same to `toMatchObject` and only one of them reaches the database.
    */
    const update = practiceUpdateFor(topic, { kind: 'graded', grade: 'knew-it' }, NOW, '')

    expect(Object.keys(update ?? {})).not.toContain('last_recall')
    expect(Object.keys(update ?? {})).not.toContain('last_recall_at')
  })

  it('and neither does a missing one, for a caller with no textarea', () => {
    // A quiz is answered, not written from memory.
    const update = practiceUpdateFor(topic, { kind: 'answered', correct: true }, NOW)

    expect(Object.keys(update ?? {})).not.toContain('last_recall')
  })

  it('a skip still writes nothing at all', () => {
    // Which is why a skip cannot clear a stored attempt either: this returns
    // before an update object exists.
    expect(practiceUpdateFor(topic, { kind: 'skipped' }, NOW, 'typed then skipped')).toBeNull()
  })
})
