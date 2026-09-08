import { describe, expect, it } from 'vitest'
import { localDateString } from '@/lib/domain/evidence'
import {
  dayCounts,
  isEditable,
  openBlockerCopy,
  prefillFrom,
  type Day,
} from '@/lib/domain/today'

const day = (over: Partial<Day> = {}): Day => ({
  id: 'd1',
  user_id: 'u1',
  day: '2026-09-08',
  explain_text: null,
  explain_done: false,
  rebuild_text: null,
  rebuild_done: false,
  apply_text: null,
  apply_done: false,
  blocker_text: null,
  blocker_resolved_at: null,
  created_at: '2026-09-08T08:00:00.000Z',
  updated_at: '2026-09-08T08:00:00.000Z',
  ...over,
})

describe('the day key is the local date', () => {
  /*
    The same two boundaries evidence.test.ts already covers for this helper, kept
    here because a wrong day key on this page silently writes to yesterday's row
    — a different and worse failure than an evidence marker dated a day out.
  */
  it('just after midnight, gives the day that has just started', () => {
    expect(localDateString(new Date(2026, 8, 8, 0, 5))).toBe('2026-09-08')
  })

  it('late in the evening, still gives today rather than tomorrow', () => {
    expect(localDateString(new Date(2026, 8, 8, 23, 55))).toBe('2026-09-08')
  })

  it('never uses toISOString, which is what makes both of those true', () => {
    /*
      At 00:05 in any zone east of Greenwich, toISOString gives YESTERDAY. This is
      the assertion that would fail if someone "simplified" the helper.
    */
    const justAfterMidnight = new Date(2026, 8, 8, 0, 5)
    const utcSlice = justAfterMidnight.toISOString().slice(0, 10)

    expect(localDateString(justAfterMidnight)).toBe('2026-09-08')
    if (justAfterMidnight.getTimezoneOffset() < 0) {
      expect(utcSlice, 'the UTC slice is a different day here — that is the bug').toBe('2026-09-07')
    }
  })
})

describe('prefill, not carry', () => {
  it('offers yesterday’s unticked lines', () => {
    const yesterday = day({
      explain_text: 'Finish closures',
      rebuild_text: 'Write once() from memory',
      apply_text: 'Decide where search state lives',
    })

    expect(prefillFrom(yesterday)).toEqual({
      explain: 'Finish closures',
      rebuild: 'Write once() from memory',
      apply: 'Decide where search state lives',
    })
  })

  it('offers nothing for a line that was ticked', () => {
    // It is finished. Offering it back would be asking you to do it twice.
    const yesterday = day({
      explain_text: 'Finish closures',
      explain_done: true,
      rebuild_text: 'Write once() from memory',
    })

    expect(prefillFrom(yesterday)).toEqual({
      explain: '',
      rebuild: 'Write once() from memory',
      apply: '',
    })
  })

  it('offers nothing when yesterday has no row', () => {
    expect(prefillFrom(null)).toEqual({ explain: '', rebuild: '', apply: '' })
  })

  it('offers nothing when yesterday was written but everything was ticked', () => {
    const finished = day({
      explain_text: 'a',
      explain_done: true,
      rebuild_text: 'b',
      rebuild_done: true,
      apply_text: 'c',
      apply_done: true,
    })

    expect(prefillFrom(finished)).toEqual({ explain: '', rebuild: '', apply: '' })
  })

  it('carries no count of how long a line has been waiting', () => {
    /*
      There is no lineage stored and none returned. "2 days" is a number whose
      only job is to say you are behind, which the free-text "When" rule and the
      no-streak rule both refuse. The Clear button already says where the text
      came from.
    */
    const result = prefillFrom(day({ rebuild_text: 'Write once()' }))

    expect(Object.keys(result)).toEqual(['explain', 'rebuild', 'apply'])
    expect(JSON.stringify(result)).not.toMatch(/day|count|carried/i)
  })
})

describe('the counts, and what an empty slot contributes', () => {
  it('counts only the lines that were written', () => {
    const partial = day({ explain_text: 'a', explain_done: true, rebuild_text: 'b' })

    expect(dayCounts(partial)).toEqual({ written: 2, done: 1 })
  })

  it('is 0 of 0 for a day with no row, not 0 of 3', () => {
    // A day you have not started is not a day you are failing at.
    expect(dayCounts(null)).toEqual({ written: 0, done: 0 })
  })
})

describe('earlier days are read-only', () => {
  it('only today may be edited', () => {
    expect(isEditable('2026-09-08', '2026-09-08')).toBe(true)
    expect(isEditable('2026-09-07', '2026-09-08')).toBe(false)
    // And not tomorrow either, whatever a clock skew might suggest.
    expect(isEditable('2026-09-09', '2026-09-08')).toBe(false)
  })
})

describe('what the page says about a carried blocker', () => {
  it('names the day it was written and says it is still open', () => {
    expect(openBlockerCopy('Sep 5', 0)).toBe('Written Sep 5 · still open')
  })

  it('mentions the others without listing them', () => {
    expect(openBlockerCopy('Sep 5', 1)).toBe(
      'Written Sep 5 · still open · 1 other blocker still open',
    )
    expect(openBlockerCopy('Sep 5', 3)).toBe(
      'Written Sep 5 · still open · 3 other blockers still open',
    )
  })
})
