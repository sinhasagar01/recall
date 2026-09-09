import { describe, expect, it } from 'vitest'
import {
  EXCHANGE_CAP,
  MIN_OPTIONS,
  OFFER_BELOW,
  canRewind,
  countRound,
  estimateRoundCost,
  meterSegments,
  METER_SEGMENTS,
  offersFrom,
  poolLine,
  scoreTone,
  sparkLabel,
  pipState,
  followUpTag,
  parseQuizDraft,
  parseRewindScore,
  parseTurn,
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
    verdict: '',
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

describe('the interviewer names the topic it is asking about', () => {
  const ID = '65df131a-2375-4fbc-bac6-4484b187654e'

  it('reads the reply and its attribution', () => {
    const result = parseTurn(JSON.stringify({ say: 'What does a closure capture?', topic_id: ID }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reply.text).toBe('What does a closure capture?')
    expect(result.reply.topicId).toBe(ID)
  })

  it('refuses an id that is not a uuid, and keeps the turn', () => {
    /*
      THE regression. The real model returns slugs — "arrow-function-this" — where
      it was asked for the bracketed uuid. Those reached a `uuid[]` column and
      every round save in production failed 22P02, silently, from the day
      interview mode shipped.

      Dropped rather than rejected: an exchange whose topic could not be
      identified is still an exchange worth having.
    */
    const result = parseTurn(JSON.stringify({ say: 'Go on.', topic_id: 'arrow-function-this' }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reply.text).toBe('Go on.')
    expect(result.reply.topicId, 'a slug is not an id').toBeNull()
  })

  it('accepts a null topic, which is what a hint is', () => {
    const result = parseTurn(JSON.stringify({ say: 'Think about the scope.', topic_id: null }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reply.topicId).toBeNull()
  })

  it('refuses a reply that says nothing', () => {
    const result = parseTurn(JSON.stringify({ say: '   ', topic_id: ID }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('said nothing')
  })

  it('is a readable error when it cannot be read at all', () => {
    const result = parseTurn('Sure! Here is my next question:')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('unreadable')
  })
})

describe('a scorecard question that names a topic id which is not one', () => {
  it('keeps the question and drops the attribution', () => {
    /*
      The production failure, at the layer it escaped through. The model answers
      "arrow-function-this" where it was handed `[uuid] Title`; that string
      reached a `uuid[]` column and every round save failed 22P02 — silently,
      from the day interview mode shipped, with `interview_rounds` at 0 rows.

      The scores were validated here from the first day. The ids were not.
    */
    const raw = JSON.stringify({
      recall: { score: 80, note: '' },
      depth: { score: 60, note: '' },
      precision: { score: 70, note: '' },
      enquiry: { score: 75, note: '' },
      overall: 71,
      summary: 'ok',
      questions: [
        { topic_id: 'arrow-function-this', title: 'Arrow functions', score: 41, note: 'thin' },
        { topic_id: '65df131a-2375-4fbc-bac6-4484b187654e', title: 'This binding', score: 88, note: 'good' },
      ],
    })

    const result = parseScorecard(raw, new Map())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.scorecard.questions, 'the question is kept').toHaveLength(2)
    expect(result.scorecard.questions[0].score, 'and so is its score').toBe(41)
    expect(result.scorecard.questions[0].topicId, 'a slug is not an id').toBeNull()
    expect(result.scorecard.questions[1].topicId).toBe('65df131a-2375-4fbc-bac6-4484b187654e')
  })

  it('is therefore not offered, which is why the scorecard says so', () => {
    // offersFrom drops it — so the row has to explain its own absence.
    const raw = JSON.stringify({
      recall: { score: 80, note: '' }, depth: { score: 60, note: '' },
      precision: { score: 70, note: '' }, enquiry: { score: 75, note: '' },
      overall: 71, summary: '',
      questions: [{ topic_id: 'not-a-uuid', title: 'X', score: 10, note: '' }],
    })
    const result = parseScorecard(raw, new Map())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(offersFrom(result.scorecard)).toEqual([])
  })
})

describe('what each round type says it has to draw on', () => {
  const pool = { topics: 21, weak: 9, quizzes: 14, incidents: 0 }

  it('counts topics, weak and quizzes for a concept round', () => {
    const line = poolLine('javascript', pool, 8)

    expect(line.lead).toBe('21 topics')
    expect(line.rest).toBe(' · 9 weak · 14 quizzes')
    expect(line.thin).toBe(false)
  })

  it('counts decisions and incidents separately for behavioural', () => {
    /*
      A ledger with three decisions and no incidents is a different round from
      one with both, so one number cannot stand for the pair.
    */
    const line = poolLine('behavioural', { topics: 2, weak: 0, quizzes: 0, incidents: 1 }, 8)

    expect(line.lead).toBe('2 decisions')
    expect(line.rest).toBe(', 1 incident')
    expect(line.thin, '3 of 8 is thin').toBe(true)
  })

  it('does not count at all for mixed', () => {
    // It is the sum of the cards directly above it; restating that says nothing.
    const line = poolLine('mixed', pool, 8)

    expect(line.lead).toBe('everything')
    expect(line.rest).toBe(' above')
    expect(line.thin, 'and it can never be thin, because it is all of them').toBe(false)
  })

  it('cannot be thin before a length is chosen', () => {
    // Thin is a claim about a round you have shaped. There is no round yet.
    expect(poolLine('javascript', { topics: 1, weak: 0, quizzes: 0, incidents: 0 }, null).thin).toBe(
      false,
    )
  })

  it('omits a count it does not have rather than printing a zero', () => {
    const line = poolLine('react', { topics: 8, weak: 0, quizzes: 0, incidents: 0 }, 4)

    expect(line.rest, 'no “· 0 weak · 0 quizzes”').toBe('')
  })
})

describe('the offer step, with a question that was re-asked', () => {
  const card = (scores: number[]): Scorecard => ({
    scores: { recall: 70, depth: 70, precision: 70, enquiry: 70 },
    overall: 70,
    verdict: '',
    summary: '',
    notes: { recall: '', depth: '', precision: '', enquiry: '' },
    questions: scores.map((score, index) => ({
      topicId: `t${index}`,
      title: `Q${index}`,
      score,
      note: '',
    })),
  })

  it('marks the rewound one and changes nothing about the tick', () => {
    /*
      A rewind is information you were given after the round. It appears on the
      row and it does not decide anything: `ticked` still comes from the score
      the ROUND found, because that is what the artefact says and the artefact is
      what is stored.
    */
    const scorecard = card([OFFER_BELOW - 30, OFFER_BELOW + 20])
    const before = offersFrom(scorecard)
    const after = offersFrom(scorecard, new Set([0]))

    expect(after.map((offer) => offer.rewound)).toEqual([true, false])
    expect(after.map((offer) => offer.ticked)).toEqual(before.map((offer) => offer.ticked))
  })

  it('keys the rewind by the QUESTION index, not the offer index', () => {
    /*
      The trap this test exists for.

      Offers are a filtered view — only questions that carry a topic id — so the
      two lists have different positions. Here question 0 has no topic and is
      dropped, so question 2 is offer 1. Re-asking question 2 must mark offer 1.
      Keying by the offer's own index would mark the wrong row, and with three
      plausible questions on screen nobody would notice.
    */
    const scorecard = card([10, 20, 30])
    scorecard.questions[0].topicId = null

    const offers = offersFrom(scorecard, new Set([2]))

    expect(offers.map((offer) => offer.title)).toEqual(['Q1', 'Q2'])
    expect(offers.map((offer) => offer.rewound)).toEqual([false, true])
  })
})

describe('what may be re-asked', () => {
  it('offers it below the threshold and not above', () => {
    // The reference draws Rewind on the 41 and the 33, and not on the 64.
    expect(canRewind(OFFER_BELOW - 1, false)).toBe(true)
    expect(canRewind(OFFER_BELOW, false)).toBe(false)
  })

  it('offers it once', () => {
    /*
      The weakest of the three things that stop a retry, and the only one that is
      a rule rather than a property: the stored score cannot move, and a round is
      never resumed so this page does not exist tomorrow.
    */
    expect(canRewind(OFFER_BELOW - 1, true)).toBe(false)
  })
})

describe('a re-asked answer is one number and one line', () => {
  it('reads a well-formed result', () => {
    const result = parseRewindScore('{"score":71,"note":"Got the consequence this time."}')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score).toBe(71)
  })

  it('refuses a score outside the scale the whole mode is built on', () => {
    const result = parseRewindScore('{"score":137,"note":"x"}')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason, 'and says the round is safe, because it is').toContain('unchanged')
  })
})

describe('a drafted quiz, before you have looked at it', () => {
  const draft = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      question: 'What does the other closure see?',
      options: ['The new value', 'A copy', 'Undefined', 'A frozen snapshot'],
      correct_option: 0,
      explanation: 'They share one scope, so a change through one is visible to the other.',
      topic_id: 't1',
      ...over,
    })

  it('reads a well-formed draft', () => {
    const result = parseQuizDraft(draft())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.options).toHaveLength(4)
    expect(result.draft.correctOption).toBe(0)
    expect(result.draft.topicId).toBe('t1')
  })

  it('refuses fewer options than the database will accept', () => {
    /*
      `topics_shape_is_consistent` requires two or more. Checking it here makes a
      bad draft a sentence on the screen you are standing on rather than a
      constraint violation from an insert — two gates, and this is the first.
    */
    const result = parseQuizDraft(draft({ options: ['Only one'] }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain(String(MIN_OPTIONS))
  })

  it('bounds the answer against the options that SURVIVED cleaning, not the raw array', () => {
    /*
      The specific hole. A blank option is dropped, so a draft of four options
      with `correct_option: 3` becomes three options and an index that no longer
      exists. Bounding against the raw array would pass it here and let the CHECK
      refuse it, which is exactly what this function exists to prevent.
    */
    const result = parseQuizDraft(draft({ options: ['a', 'b', '   ', 'd'], correct_option: 3 }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('which option was correct')
  })

  it('treats a missing topic as no parent rather than as a failure', () => {
    // A follow-up may genuinely be about nothing you have saved. The quiz is
    // still worth keeping; it just has no provenance to record.
    const result = parseQuizDraft(draft({ topic_id: null }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.topicId).toBeNull()
  })

  it('is a readable error when it cannot be read at all', () => {
    const result = parseQuizDraft('Sure! Here is a quiz for you:')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('Nothing was saved')
  })
})

describe('the hero meter', () => {
  const lit = (overall: number) => meterSegments(overall).filter((s) => s.on).length

  it('lights one segment per five points, floored', () => {
    // 74 lights fourteen — rounding up would claim a point the round did not earn.
    expect(lit(74)).toBe(14)
    expect(lit(75)).toBe(15)
    expect(lit(79)).toBe(15)
  })

  it('marks the last lit segment as the tip, and only that one', () => {
    const tips = meterSegments(74).map((s, i) => (s.tip ? i : -1)).filter((i) => i >= 0)
    expect(tips).toEqual([13])
  })

  it('has no tip at zero, and every segment at a hundred', () => {
    expect(lit(0)).toBe(0)
    expect(meterSegments(0).some((s) => s.tip)).toBe(false)
    expect(lit(100)).toBe(METER_SEGMENTS)
  })
})

describe('the three bands the scale is drawn in', () => {
  it('agrees with canRewind at the boundary, because both read OFFER_BELOW', () => {
    /*
      The point of deriving this from the existing thresholds. The drawing puts a
      rose bar on exactly the rows that carry a Rewind, and that is true HERE
      because they are one rule rather than two numbers that happen to agree.
    */
    expect(scoreTone(OFFER_BELOW - 1)).toBe('lo')
    expect(canRewind(OFFER_BELOW - 1, false)).toBe(true)

    expect(scoreTone(OFFER_BELOW)).toBe('mid')
    expect(canRewind(OFFER_BELOW, false)).toBe(false)
  })

  it('matches the reference row for row', () => {
    // 92 and 81 emerald, 64 violet, 41 and 33 rose.
    expect([92, 81, 64, 41, 33].map(scoreTone)).toEqual(['hi', 'hi', 'mid', 'lo', 'lo'])
  })
})

describe('the sparkline axis', () => {
  const now = new Date('2026-09-09T12:00:00Z')

  it('says today for today, and a date for anything else', () => {
    expect(sparkLabel('2026-09-09T09:00:00Z', now)).toBe('today')
    expect(sparkLabel('2026-08-18T09:00:00Z', now)).toMatch(/^18 Aug/)
  })
})

describe('the room says which follow-up you are on', () => {
  const q = (): Turn => them('question')
  const f = (): Turn => them('follow-up')

  it('counts follow-ups since the current question, not the whole round', () => {
    expect(followUpTag('staff', [q(), f(), you('answer'), f()])).toBe('follow-up 2 of 2')
    expect(followUpTag('staff', [q(), f(), q(), f()])).toBe('follow-up 1 of 2')
  })

  it('says nothing before the first follow-up', () => {
    expect(followUpTag('staff', [q(), you('answer')])).toBeNull()
  })

  it('gives no total where the interviewer has no ceiling', () => {
    // A skeptical principal pushes until you concede or hold. Inventing a
    // total would be a promise the prompt does not make.
    expect(followUpTag('skeptical', [q(), f()])).toBe('follow-up 1')
  })
})

describe('the progress pips', () => {
  it('fill behind you and mark where you are', () => {
    expect([0, 1, 2, 3].map((i) => pipState(i, 2))).toEqual(['done', 'done', 'now', 'todo'])
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
