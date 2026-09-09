import { describe, expect, it } from 'vitest'
import { clockOf, countRound, outlineRound, type Turn } from '@/lib/domain/interview'

const ask = (topicId: string | null): Turn => ({
  speaker: 'interviewer',
  text: 'q',
  topicId,
  kind: 'question',
})
const follow = (topicId: string | null): Turn => ({
  speaker: 'interviewer',
  text: 'f',
  topicId,
  kind: 'follow-up',
})
const answer = (topicId: string | null): Turn => ({
  speaker: 'you',
  text: 'a',
  topicId,
  kind: 'answer',
})
const hint = (): Turn => ({ speaker: 'you', text: 'h', topicId: null, kind: 'hint' })

describe('outlineRound', () => {
  it('is one row per question, in the order they were asked', () => {
    const rows = outlineRound([ask('a'), answer('a'), ask('b'), answer('b'), ask('c')])

    expect(rows.map((row) => row.topicId)).toEqual(['a', 'b', 'c'])
  })

  it('gives each question only its own follow-ups', () => {
    const rows = outlineRound([
      ask('a'),
      answer('a'),
      follow('a'),
      answer('a'),
      follow('a'),
      answer('a'),
      ask('b'),
      answer('b'),
      follow('b'),
      answer('b'),
    ])

    expect(rows[0]).toMatchObject({ followUpsOffered: 2, followUpsHeld: 2 })
    expect(rows[1]).toMatchObject({ followUpsOffered: 1, followUpsHeld: 1 })
  })

  it('does not count a follow-up you walked away from', () => {
    const rows = outlineRound([ask('a'), answer('a'), follow('a'), ask('b'), answer('b')])

    expect(rows[0]).toMatchObject({ followUpsOffered: 1, followUpsHeld: 0 })
  })

  it('looks past a hint to the answer after it', () => {
    // A hint is an aside, not a refusal — the same rule countRound applies.
    const rows = outlineRound([ask('a'), answer('a'), follow('a'), hint(), answer('a')])

    expect(rows[0]).toMatchObject({ followUpsOffered: 1, followUpsHeld: 1 })
  })

  it('sums to exactly what the round total says', () => {
    /*
      The reason this shares countRound's positional reasoning rather than
      reimplementing it. The waiting screen shows both — the strip's total and
      the per-question rows — and two numbers derived differently from the same
      transcript will eventually disagree on screen, which is the failure that
      put a CHECK constraint on this table in the first place.
    */
    const turns = [
      ask('a'),
      answer('a'),
      follow('a'),
      answer('a'),
      follow('a'),
      ask('b'),
      answer('b'),
      follow('b'),
      hint(),
      answer('b'),
    ]
    const rows = outlineRound(turns)
    const counts = countRound(turns)

    expect(rows.reduce((total, row) => total + row.followUpsOffered, 0)).toBe(
      counts.followUpsOffered,
    )
    expect(rows.reduce((total, row) => total + row.followUpsHeld, 0)).toBe(counts.followUpsHeld)
    expect(rows.length).toBe(counts.asked)
  })

  it('is empty for a round that never got a question out', () => {
    expect(outlineRound([])).toEqual([])
  })
})

describe('clockOf', () => {
  it('pads the seconds', () => {
    expect(clockOf(1121)).toBe('18:41')
    expect(clockOf(65)).toBe('1:05')
  })

  it('does not roll over at an hour', () => {
    // A ninety-minute round reads 92:14 rather than pretending to be 1:32:14 —
    // the strip's label is "elapsed", and minutes are what it means.
    expect(clockOf(5534)).toBe('92:14')
  })

  it('is 0:00 rather than negative', () => {
    expect(clockOf(-5)).toBe('0:00')
  })
})
