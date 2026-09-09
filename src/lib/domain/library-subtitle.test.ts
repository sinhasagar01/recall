import { describe, expect, it } from 'vitest'
import { librarySubtitle } from '@/lib/domain/library'

/**
 * The line under the library's heading.
 *
 * Two defects, and the second is the one worth a test: the noun was false, and
 * the counts were duplicates of controls three inches below with better labels.
 */
const AT = new Date('2026-09-09T12:00:00Z')

const line = (over: Partial<Parameters<typeof librarySubtitle>[0]> = {}) =>
  librarySubtitle({
    total: 63,
    matching: 63,
    isFiltered: false,
    lastPracticedAt: '2026-09-07T12:00:00Z',
    at: AT,
    ...over,
  })

describe('the library subtitle', () => {
  it('says only what nothing else on the screen says', () => {
    /*
      `63` is the same variable the All chip renders and `47` the same predicate
      the Weak chip renders. Restating them here was one question asked twice —
      unlike the sources page's pair, which are two different questions.
    */
    const subtitle = line()

    expect(subtitle).toContain('Last practiced')
    expect(subtitle, 'the total belongs to the All chip').not.toContain('63')
    expect(subtitle, 'and the review count to the Weak chip').not.toContain('need review')
  })

  it('never calls a mixed library "topics"', () => {
    /*
      THE regression. 63 rows are 39 topics and 24 quizzes; the drawing's word
      was true in an arc where every row was a topic and went false when quizzes
      arrived, without anyone editing it.
    */
    for (const subtitle of [line(), line({ isFiltered: true, matching: 39 }), line({ total: 0 })]) {
      expect(subtitle, `"${subtitle}" calls a mixed set topics`).not.toMatch(/\btopics?\b/)
    }
  })

  it('keeps the one figure that appears nowhere else', () => {
    // No chip carries the size of the current filtered result.
    expect(line({ isFiltered: true, matching: 39 })).toBe('39 of 63 match')
  })

  it('says nothing about practice when there is nothing saved', () => {
    expect(line({ total: 0 })).toBe('Nothing saved yet')
  })
})
