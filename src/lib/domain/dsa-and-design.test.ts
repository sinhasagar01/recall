import { describe, expect, it } from 'vitest'
import {
  advancePhase,
  LENGTHS,
  PHASES,
  phaseWindows,
  poolLine,
  problemCount,
  questionCount,
  type Pool,
} from '@/lib/domain/interview'

const EMPTY: Pool = {
  topics: 0,
  weak: 0,
  quizzes: 0,
  incidents: 0,
  adrs: 0,
  diagrams: 0,
  exercises: 0,
}

describe('problemCount', () => {
  it('is one problem at twenty minutes and three at ninety', () => {
    expect(problemCount(20)).toBe(1)
    expect(problemCount(45)).toBe(2)
    expect(problemCount(60)).toBe(2)
    expect(problemCount(90)).toBe(3)
  })

  it('never exceeds what the code column will accept', () => {
    /*
      Three is also the `interview_rounds_code_is_bounded` CHECK. The two are
      the same product decision in two places, and this is the assertion that
      makes them disagree loudly rather than at the insert.
    */
    for (const minutes of LENGTHS) expect(problemCount(minutes)).toBeLessThanOrEqual(3)
  })

  it('is a different unit from a concept round, not a fraction of one', () => {
    // Ninety minutes buys sixteen concepts or three problems. Writing a solution
    // and defending its complexity is not a scaled-down concept question.
    for (const minutes of LENGTHS) expect(problemCount(minutes)).toBeLessThan(questionCount(minutes))
  })
})

describe('phaseWindows', () => {
  it('is four phases at every length', () => {
    // The phases stretch; the count does not. Twenty minutes is a rushed design
    // round, not a two-phase one.
    for (const minutes of LENGTHS) expect(phaseWindows(minutes)).toHaveLength(PHASES.length)
  })

  it('ends exactly at the round length, at every length', () => {
    /*
      Pinned rather than accumulated. Summing four rounded shares leaves a
      sixty-minute strip ending at 59 or 61, and a strip claiming a minute the
      round does not have is the drawing lying about the clock.
    */
    for (const minutes of LENGTHS) {
      const windows = phaseWindows(minutes)
      expect(windows[windows.length - 1].to).toBe(minutes)
    }
  })

  it('is continuous — no gaps and no overlaps', () => {
    for (const minutes of LENGTHS) {
      const windows = phaseWindows(minutes)
      expect(windows[0].from).toBe(0)
      for (let i = 1; i < windows.length; i += 1) {
        expect(windows[i].from).toBe(windows[i - 1].to)
      }
    }
  })

  it('matches the strip the reference draws at sixty minutes', () => {
    expect(phaseWindows(60)).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 25 },
      { from: 25, to: 45 },
      { from: 45, to: 60 },
    ])
  })

  it('gives the deep dive the longest window and requirements the shortest', () => {
    const spans = phaseWindows(90).map((w) => w.to - w.from)
    expect(Math.max(...spans)).toBe(spans[2])
    expect(Math.min(...spans)).toBe(spans[0])
  })
})

describe('advancePhase', () => {
  it('moves forward one at a time', () => {
    expect(advancePhase(0)).toBe(1)
    expect(advancePhase(1)).toBe(2)
    expect(advancePhase(2)).toBe(3)
  })

  it('stops at the last phase rather than wrapping or throwing', () => {
    /*
      A model that keeps reporting the phase done past the end should leave the
      round in its final phase. Wrapping would restart the conversation; throwing
      would take the room down over a reply it should simply absorb.
    */
    expect(advancePhase(3)).toBe(3)
    expect(advancePhase(9)).toBe(3)
  })

  it('never goes backwards from any phase that exists', () => {
    /*
      Forward only: a design round is a conversation and you cannot un-say the
      requirements. Stated over the VALID indices, because that is where the
      property holds — clamping 4 to 3 is a decrease, and it is the right one.
      The first version of this test asserted it over 0..6 and failed on its own
      overreach rather than on the code.
    */
    for (const from of PHASES.map((_, index) => index)) {
      expect(advancePhase(from)).toBeGreaterThanOrEqual(from)
    }
  })

  it('lands on a real phase whatever it is given', () => {
    // The other half: any input at all resolves to an index PHASES has.
    for (let from = -3; from <= 9; from += 1) {
      const next = advancePhase(from)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(PHASES.length)
    }
  })
})

describe('the two new pool lines', () => {
  it('says DSA is generated, on the card where DSA is chosen', () => {
    /*
      The page's sub-line says an exception to "nothing is asked that you have
      not saved" exists; this says it is this one. Someone picking DSA is looking
      here, not at a sentence covering all seven types.
    */
    const line = poolLine('dsa', EMPTY, 2)

    expect(line.lead).toBe('2 problems')
    expect(line.rest).toContain('generated, not from your library')
    expect(line.rest).toContain('your code is kept')
  })

  it('and a DSA round is never thin, because it draws on nothing', () => {
    // Thin means "there is not enough of yours to fill this". A generated round
    // always fills, so thin would be a false alarm rather than an honest one.
    expect(poolLine('dsa', EMPTY, 3).thin).toBe(false)
  })

  it('is one problem, singular, at twenty minutes', () => {
    expect(poolLine('dsa', EMPTY, 1).lead).toBe('1 problem')
  })

  it('counts three ledger kinds for a design round', () => {
    const line = poolLine('design', { ...EMPTY, adrs: 3, diagrams: 2, exercises: 1 }, null)

    expect(line.lead).toBe('3 ADRs')
    expect(line.rest).toBe(' · 2 diagrams · 1 scale exercise')
    expect(line.thin).toBe(false)
  })

  it('is thin with an empty ledger, and says what is missing', () => {
    /*
      The decision this arc had to make out loud. There is no fallback to
      "design-shaped topics": category is free text, nothing marks a topic as
      design material, and a keyword list over what the user typed would be a
      claim the app cannot check — on the one screen whose job is telling the
      truth about what a round can draw on.
    */
    const line = poolLine('design', EMPTY, null)

    expect(line.thin).toBe(true)
    expect(`${line.lead}${line.rest}`).toBe('0 ADRs, 0 diagrams — nothing to draw on')
  })

  it('is not thin on diagrams alone, with no ADR', () => {
    // Any of the three is material. ADRs are the best of them, not the only one.
    expect(poolLine('design', { ...EMPTY, diagrams: 2 }, null).thin).toBe(false)
  })

  it('leaves every other type exactly as it was', () => {
    const concepts = poolLine('javascript', { ...EMPTY, topics: 21, weak: 9, quizzes: 14 }, 8)
    expect(concepts.lead).toBe('21 topics')
    expect(concepts.rest).toBe(' · 9 weak · 14 quizzes')

    expect(poolLine('mixed', EMPTY, 8).lead).toBe('everything')
  })
})
