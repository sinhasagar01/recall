import { describe, expect, it } from 'vitest'
import { GRADE_TO_CONFIDENCE, gradeQuiz, type Grade } from '@/lib/domain/confidence'
import { sessionSummary, sessionTally } from '@/lib/domain/practice-session'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'
import type { Confidence } from '@/lib/domain/types'

/*
  Still written in the grade screen's words, because that is what a person picks;
  the result records where the grade LANDED, which is the field a quiz can also
  fill in. Same test, one arrow further along.
*/
const result = (before: Confidence, grade: Grade) => ({
  topic: makeTopic({ confidence: before }),
  confidence: GRADE_TO_CONFIDENCE[grade],
})

const quizResult = (before: Confidence, correct: boolean) => ({
  topic: makeQuiz({ confidence: before }),
  confidence: gradeQuiz(correct),
})

describe('sessionTally', () => {
  it('counts nothing for an empty session', () => {
    expect(sessionTally([])).toEqual({ weak: 0, okay: 0, strong: 0, total: 0 })
  })

  it('counts each outcome', () => {
    const tally = sessionTally([
      result('new', 'didnt-know'),
      result('weak', 'partly'),
      result('okay', 'partly'),
      result('strong', 'knew-it'),
    ])
    expect(tally).toEqual({ weak: 1, okay: 2, strong: 1, total: 4 })
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

describe('a session holding both shapes', () => {
  it('tallies a quiz beside a topic, in the same three columns', () => {
    const tally = sessionTally([
      result('weak', 'knew-it'),
      quizResult('weak', true),
      quizResult('okay', false),
    ])

    // Never 'okay' from a quiz — the two right answers sit together in strong.
    expect(tally).toEqual({ weak: 1, okay: 0, strong: 2, total: 3 })
  })

  it('names quizzes as quizzes when only quizzes moved', () => {
    expect(sessionSummary([quizResult('weak', true)])).toBe(
      '1 quiz moved out of needing review.',
    )
    expect(sessionSummary([quizResult('weak', true), quizResult('new', true)])).toBe(
      '2 quizzes moved out of needing review.',
    )
  })

  it('falls back to cards only when the moved set is genuinely mixed', () => {
    expect(sessionSummary([result('weak', 'knew-it'), quizResult('new', true)])).toBe(
      '2 cards moved out of needing review.',
    )

    // A mixed SESSION in which only topics moved still says topics.
    expect(sessionSummary([result('weak', 'knew-it'), quizResult('strong', true)])).toBe(
      '1 topic moved out of needing review.',
    )
  })

  it('counts a wrong answer as moving in', () => {
    expect(sessionSummary([quizResult('strong', false)])).toBe(
      "1 quiz moved in — it'll come first next time.",
    )
  })
})
