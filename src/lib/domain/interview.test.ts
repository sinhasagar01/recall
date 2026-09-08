import { describe, expect, it } from 'vitest'
import {
  EXCHANGE_CAP,
  OFFER_BELOW,
  countRound,
  estimateRoundCost,
  offersFrom,
  parseScorecard,
  questionCount,
  scoreBand,
  type Scorecard,
  type Turn,
} from '@/lib/domain/interview'

const you = (kind: Turn['kind'], text = 'x'): Turn => ({ speaker: 'you', text, topicId: null, kind })
const them = (kind: Turn['kind'], text = 'x'): Turn => ({
  speaker: 'interviewer',
  text,
  topicId: null,
  kind,
})

describe('what is counted in code, never asked of a model', () => {
  it('counts YOUR actions, not the interviewer echoing them', () => {
    /*
      The regression. A hint request and the hint that answers it both carry kind
      `hint`, so counting by kind alone reported "2 hints used" for one click.
      Found by looking at the rendered scorecard beside the reference — both
      numbers were plausible and nothing asserted the difference.
    */
    const turns = [them('question'), you('hint'), them('hint')]

    expect(countRound(turns).hintsUsed).toBe(1)
  })

  it('never counts a clarifying question as an answer', () => {
    // Its own action for exactly this reason: asking is never a wrong answer.
    const turns = [them('question'), you('clarification'), them('clarification-answer')]
    const counts = countRound(turns)

    expect(counts.questionsAsked).toBe(1)
    expect(counts.answered).toBe(0)
  })

  it('counts a follow-up as held only when an answer follows it', () => {
    const held = [them('question'), you('answer'), them('follow-up'), you('answer')]
    expect(countRound(held).followUpsHeld).toBe(1)

    const dropped = [them('question'), you('answer'), them('follow-up')]
    expect(countRound(dropped).followUpsHeld).toBe(0)

    /* A hint between the follow-up and the answer does not break the hold. */
    const hinted = [
      them('question'),
      you('answer'),
      them('follow-up'),
      you('hint'),
      them('hint'),
      you('answer'),
    ]
    expect(countRound(hinted).followUpsHeld).toBe(1)
  })

  it('can never report more held than were offered', () => {
    // The impossible pair the reference drew, and the database refuses.
    const turns = [them('question'), you('answer'), them('follow-up'), you('answer')]
    const counts = countRound(turns)

    expect(counts.followUpsHeld).toBeLessThanOrEqual(counts.followUpsOffered)
    expect(counts.answered).toBeLessThanOrEqual(counts.asked + counts.followUpsOffered)
  })
})

describe('the shape of a round', () => {
  it('is set by type and duration, never by a slider', () => {
    expect(questionCount(20)).toBe(4)
    expect(questionCount(45)).toBe(8)
    expect(questionCount(90)).toBe(16)
  })

  it('quotes a cost RANGE, never a figure', () => {
    const cost = estimateRoundCost(45)

    expect(cost.lowTokens).toBeLessThan(cost.highTokens)
    expect(cost.lowUsd).toBeLessThan(cost.highUsd)
  })

  it('never quotes more than the cap could actually spend', () => {
    /* The quadratic is bounded by EXCHANGE_CAP, so 90 minutes is not 4× 45. */
    const long = estimateRoundCost(90)
    const ceiling = ((EXCHANGE_CAP * (EXCHANGE_CAP + 1)) / 2) * 320 * 1.25

    expect(long.highTokens).toBeLessThanOrEqual(ceiling)
  })
})

describe('reading a scorecard', () => {
  const valid = {
    recall: { score: 86, note: 'a' },
    depth: { score: 41, note: 'b' },
    precision: { score: 79, note: 'c' },
    enquiry: { score: 80, note: 'd' },
    overall: 74,
    summary: 'e',
    questions: [{ topic_id: 't1', title: 'One', score: 41, note: 'f' }],
  }

  it('reads a well-formed one', () => {
    const result = parseScorecard(JSON.stringify(valid), new Map())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scorecard.scores.depth).toBe(41)
    expect(result.scorecard.overall).toBe(74)
  })

  it('refuses a score outside the scale rather than rendering it', () => {
    // A bar wider than its track is a data error. The database refuses it too —
    // this is the first of the two gates, not the only one.
    const result = parseScorecard(JSON.stringify({ ...valid, overall: 137 }), new Map())

    expect(result.ok).toBe(false)
  })

  it('is a readable error when it cannot be read at all', () => {
    const result = parseScorecard('Sure! Here is how you did:', new Map())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('unreadable')
  })
})

describe('the offer step', () => {
  const card = (scores: number[]): Scorecard => ({
    scores: { recall: 70, depth: 70, precision: 70, enquiry: 70 },
    overall: 70,
    summary: '',
    notes: { recall: '', depth: '', precision: '', enquiry: '' },
    questions: scores.map((score, index) => ({
      topicId: `t${index}`,
      title: `Q${index}`,
      score,
      note: '',
    })),
  })

  it('ticks what went thin and leaves the rest for you to decide', () => {
    const offers = offersFrom(card([OFFER_BELOW - 1, OFFER_BELOW, OFFER_BELOW + 20]))

    expect(offers.map((offer) => offer.ticked)).toEqual([true, false, false])
  })

  it('skips a question with no topic behind it', () => {
    // Nothing to mark weak, so nothing to offer.
    const withNull = card([10])
    withNull.questions[0].topicId = null

    expect(offersFrom(withNull)).toEqual([])
  })
})

describe('the band beside the ring', () => {
  it('says it in words, so the number is not the only signal', () => {
    expect(scoreBand(92)).toContain('Strong')
    expect(scoreBand(74)).toContain('Solid')
    expect(scoreBand(55)).toContain('Mixed')
    expect(scoreBand(20)).toContain('Thin')
  })
})
