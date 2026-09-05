import { describe, expect, it } from 'vitest'
import { STALE_WINDOW_DAYS, isSettled, isStale } from '@/lib/domain/confidence'
import { makeTopic } from '@/lib/domain/topic-fixture'
import type { Confidence } from '@/lib/domain/types'

const NOW = new Date('2026-09-05T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

const ago = (days: number, ms = 0) =>
  new Date(NOW.getTime() - days * DAY - ms).toISOString()

const topic = (confidence: Confidence, last_practiced_at: string | null) =>
  makeTopic({ confidence, last_practiced_at })

describe('isSettled', () => {
  /*
    Derived from needsReview rather than listing confidences again. "Settled" is
    exactly "not on the weak page", and if needsReview ever changes, this follows
    it instead of contradicting it.
  */
  it.each([
    ['okay', true],
    ['strong', true],
    ['weak', false],
    ['new', false],
  ] as const)('%s -> %s', (confidence, expected) => {
    expect(isSettled({ confidence })).toBe(expected)
  })
})

describe('isStale', () => {
  it('is false for anything that still needs review', () => {
    // Those are already on the weak page. Being there twice would be worse than
    // not being there at all.
    expect(isStale(topic('weak', ago(400)), NOW)).toBe(false)
    expect(isStale(topic('new', null), NOW)).toBe(false)
  })

  it('is false for a settled topic practised recently', () => {
    expect(isStale(topic('strong', ago(1)), NOW)).toBe(false)
    expect(isStale(topic('okay', ago(30)), NOW)).toBe(false)
  })

  it('is false exactly on the window and true a millisecond past it', () => {
    // Mirrors RECENT_WINDOW_DAYS, where "recent" is `gap <= window`. Stale is
    // therefore strictly greater, so the boundary belongs to the settled side.
    expect(isStale(topic('strong', ago(STALE_WINDOW_DAYS)), NOW)).toBe(false)
    expect(isStale(topic('strong', ago(STALE_WINDOW_DAYS, 1)), NOW)).toBe(true)
  })

  it('covers okay as well as strong', () => {
    // An `okay` topic left alone is at least as forgotten as a `strong` one —
    // you only half knew it when you last looked.
    expect(isStale(topic('okay', ago(90)), NOW)).toBe(true)
    expect(isStale(topic('strong', ago(90)), NOW)).toBe(true)
  })

  it('treats a settled topic that was never practised as stale', () => {
    /*
      Unreachable through the app today — confidence only moves through grading,
      which always stamps last_practiced_at. Handled anyway, and handled the way
      orderForPractice handles it: no stamp is an infinite gap, not a zero one.
    */
    expect(isStale(topic('strong', null), NOW)).toBe(true)
  })

  it('treats an unparseable stamp as stale rather than fresh', () => {
    expect(isStale(topic('strong', 'not-a-date'), NOW)).toBe(true)
  })
})
