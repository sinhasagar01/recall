import { describe, expect, it } from 'vitest'
import { sessionSummary, sessionTally } from '@/lib/domain/practice-session'
import { makeTopic } from '@/lib/domain/topic-fixture'

const result = (before: 'new' | 'weak' | 'okay' | 'strong', grade: 'didnt-know' | 'partly' | 'knew-it') => ({
  topic: makeTopic({ confidence: before }),
  grade,
})

describe('sessionTally', () => {
  it('counts nothing for an empty session', () => {
    expect(sessionTally([])).toEqual({ 'didnt-know': 0, partly: 0, 'knew-it': 0, total: 0 })
  })

  it('counts each grade', () => {
    const tally = sessionTally([
      result('new', 'didnt-know'),
      result('weak', 'partly'),
      result('okay', 'partly'),
      result('strong', 'knew-it'),
    ])
    expect(tally).toEqual({ 'didnt-know': 1, partly: 2, 'knew-it': 1, total: 4 })
  })

  it('counts graded answers only — a skip is not in the list at all', () => {
    expect(sessionTally([result('new', 'knew-it')]).total).toBe(1)
  })
})

describe('sessionSummary', () => {
  /*
    The mock's sentence ("Three topics moved out of weak. Two moved in.") is
    data-dependent copy, which DESIGN.md now flags as illustrative. This derives
    the real one from each topic's confidence before and after, through the same
    needsReview predicate the rail and the weak page use.
  */
  it('says nothing was graded when nothing was', () => {
    expect(sessionSummary([])).toBe('Nothing was graded this time.')
  })

  it('counts topics that moved out of needing review', () => {
    const results = [result('weak', 'knew-it'), result('new', 'partly')]
    expect(sessionSummary(results)).toBe('2 topics moved out of needing review.')
  })

  it('counts topics that moved in', () => {
    expect(sessionSummary([result('strong', 'didnt-know')])).toBe(
      "1 topic moved in — it'll come first next time.",
    )
  })

  it('reports both directions in one sentence', () => {
    const results = [result('weak', 'knew-it'), result('okay', 'didnt-know')]
    expect(sessionSummary(results)).toBe(
      "1 topic moved out of needing review. 1 moved in — it'll come first next time.",
    )
  })

  it('says so when nothing changed category', () => {
    // okay -> knew-it: neither before nor after needs review.
    expect(sessionSummary([result('okay', 'knew-it')])).toBe('Nothing changed category this time.')
  })

  it('is singular and plural correctly', () => {
    const many = [result('weak', 'knew-it'), result('weak', 'knew-it')]
    expect(sessionSummary(many)).toContain('2 topics moved out')
    expect(sessionSummary([result('weak', 'knew-it')])).toContain('1 topic moved out')
  })
})
