import { describe, expect, it } from 'vitest'
import {
  CONTEXT_TOKENS,
  MAX_OUTPUT_TOKENS,
  coverageSummary,
  coverageToRows,
  estimateCostRange,
  estimateTokens,
  isTooLong,
  markDuplicates,
  mergeCoverage,
  normaliseTitle,
  parseCoverage,
  parseExtraction,
  salvageArrayPrefix,
  type CoverageEntry,
  type ExtractedConcept,
} from '@/lib/domain/extraction'

const concept = (title: string, extra: Partial<ExtractedConcept> = {}): ExtractedConcept => ({
  title,
  definition: `What ${title} means.`,
  mentalModel: null,
  whenNotToUse: null,
  timestamp: null,
  questions: [],
  ...extra,
})

const entry = (title: string, extra: Partial<CoverageEntry> = {}): CoverageEntry => ({
  title,
  normalised: normaliseTitle(title),
  timestamp: null,
  status: 'kept',
  reason: null,
  topicId: null,
  pass: 1,
  partial: false,
  ...extra,
})

describe('the estimate, and how wrong it is allowed to be', () => {
  it('matches the reference on a known transcript', () => {
    // 8,400 words was drawn as "≈ 11,200 tokens in". The factor was chosen to
    // agree with a number someone had already sanity-checked.
    expect(estimateTokens(8_400)).toBe(11_172)
  })

  it('is a range, never a figure', () => {
    const { low, high } = estimateCostRange(8_400)

    expect(low).toBeLessThan(high)
    /*
      The span exists because output volume is the thing being paid to discover.
      A point estimate here would be the same class of claim as "a cancelled call
      is not billed" — stated as fact, unknowable until the call returns.
    */
    expect(high / low).toBeGreaterThan(1.2)
  })

  it('costs nothing for nothing, and never goes negative', () => {
    expect(estimateTokens(0)).toBe(0)
    expect(estimateTokens(-500)).toBe(0)
    expect(estimateCostRange(0)).toEqual({ low: 0, high: 0 })
  })
})

describe('the too-long check', () => {
  /*
    Both sides of the threshold, because a boundary asserted from one side is a
    boundary that moves silently. The margin is applied to the ESTIMATE, and it
    is applied in the safe direction: the check must refuse a transcript the
    estimate underrates, since running low is what would buy a call that cannot
    succeed.
  */
  const usable = CONTEXT_TOKENS - MAX_OUTPUT_TOKENS
  const thresholdWords = Math.floor(usable / 1.25 / 1.33)

  it('allows what fits, with the margin applied', () => {
    expect(isTooLong(thresholdWords - 100)).toBe(false)
  })

  it('refuses what does not', () => {
    expect(isTooLong(thresholdWords + 100)).toBe(true)
  })

  it('refuses the length the reference names, before anything is sent', () => {
    expect(isTooLong(61_000)).toBe(true)
    expect(isTooLong(8_400)).toBe(false)
  })
})

describe('reading a response', () => {
  const body = (concepts: unknown) => JSON.stringify({ concepts })

  it('reads a complete answer', () => {
    const result = parseExtraction(body([{ title: 'A', definition: 'B', questions: [] }]), 'stop')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.partial).toBe(false)
    expect(result.concepts.map((c) => c.title)).toEqual(['A'])
  })

  it('salvages the complete elements of a truncated one', () => {
    const whole = body([
      { title: 'A', definition: 'first', questions: [] },
      { title: 'B', definition: 'second', questions: [] },
      { title: 'C', definition: 'third', questions: [] },
    ])
    const cut = whole.slice(0, whole.indexOf('"C"') + 8)

    const result = parseExtraction(cut, 'length')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Two whole ones kept, the fragment discarded — six concepts from a failed
    // call are offered for review rather than thrown away.
    expect(result.concepts.map((c) => c.title)).toEqual(['A', 'B'])
    expect(result.partial).toBe(true)
  })

  it('is not confused by a brace inside a string', () => {
    /*
      A definition containing `{` would unbalance a naive depth count and swallow
      every concept after it. The scanner tracks string state, so this is one
      element rather than none.
    */
    expect(salvageArrayPrefix('[{"a":"a { brace"},{"b":2}')).toEqual([
      { a: 'a { brace' },
      { b: 2 },
    ])

    /*
      And the brace must not end an element early either: here the fragment is
      genuinely incomplete, so only the first element survives. Both directions,
      because a scanner that is wrong about strings fails one way or the other.
    */
    expect(salvageArrayPrefix('[{"a":1},{"b":"unclosed { and no end')).toEqual([{ a: 1 }])
  })

  it('is a readable error, never a partial save, when it cannot be read at all', () => {
    const prose = parseExtraction('Sure! Here are the concepts:', 'stop')

    expect(prose.ok).toBe(false)
    if (prose.ok) return
    expect(prose.reason).toContain('not readable as JSON')
  })

  it('says so when the model found nothing', () => {
    const empty = parseExtraction(body([]), 'stop')

    expect(empty.ok).toBe(false)
    if (empty.ok) return
    expect(empty.reason).toBe('No concepts found.')
  })

  it('drops a concept it cannot render, and records that it did', () => {
    const result = parseExtraction(
      body([
        { title: 'Good', definition: 'fine', questions: [] },
        { title: '   ', definition: 'no title', questions: [] },
      ]),
      'stop',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.concepts.map((c) => c.title)).toEqual(['Good'])
    expect(result.dropped).toHaveLength(1)
  })

  it('drops a question whose answer points past its options', () => {
    /*
      `topics_shape_is_consistent` would reject this at save time with a 400.
      Dropping it here makes that a readable review screen instead of a failed
      save of everything else.
    */
    const result = parseExtraction(
      body([
        {
          title: 'A',
          definition: 'B',
          questions: [
            { question: 'ok', options: ['x', 'y'], correct_option: 1 },
            { question: 'out of range', options: ['x', 'y'], correct_option: 5 },
            { question: 'only one option', options: ['x'], correct_option: 0 },
          ],
        },
      ]),
      'stop',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.concepts[0].questions.map((q) => q.question)).toEqual(['ok'])
  })
})

describe('duplicate detection, and the limit of it', () => {
  it('matches through case, punctuation and spacing', () => {
    const marked = markDuplicates(
      [concept('Function declarations are hoisted')],
      ['function  declarations, are hoisted!'],
    )

    expect(marked[0].duplicateOf).toBe('function  declarations, are hoisted!')
    expect(marked[0].keep, 'a duplicate arrives unticked').toBe(false)
  })

  it('keeps everything else ticked by default', () => {
    const marked = markDuplicates([concept('Something new')], ['Something else'])

    expect(marked[0].duplicateOf).toBeNull()
    // You are mining a video: unticking two beats ticking twelve.
    expect(marked[0].keep).toBe(true)
  })

  it('MISSES a rephrased title, and this is asserted rather than described', () => {
    /*
      The honest limit. No fuzzy threshold is used, because a similarity cutoff
      turns a missed duplicate into a wrongly-unticked NEW concept — and losing
      something you wanted, silently, is the worse failure.

      So this arrives ticked and would create a second topic. The review screen
      is where a person catches it, which is one of the reasons review is not
      optional. Asserted here so the limit is a known quantity rather than a
      surprise in six months.
    */
    const marked = markDuplicates(
      [concept('How function declarations get hoisted')],
      ['Function declarations are hoisted'],
    )

    expect(marked[0].duplicateOf).toBeNull()
    expect(marked[0].keep).toBe(true)
  })
})

describe('coverage', () => {
  it('merges a second pass rather than overwriting it', () => {
    const existing = [
      entry('Closures', { status: 'kept' }),
      entry('Hoisting', { status: 'dropped', reason: 'you dropped it' }),
    ]
    const incoming = [
      entry('Closures', { status: 'dropped', reason: 'offered again', pass: 2 }),
      entry('The module pattern', { pass: 2 }),
    ]

    const merged = mergeCoverage(existing, incoming)

    expect(merged.map((e) => e.title)).toEqual(['Closures', 'Hoisting', 'The module pattern'])
    /*
      Existing entries win on every field. A later reading of the same video does
      not get to revise a decision you already made — coverage is the record of
      what you chose, not of what the model last said.
    */
    expect(merged[0].status).toBe('kept')
    expect(merged[0].pass).toBe(1)
    expect(merged[2].pass).toBe(2)
  })

  it('cannot un-drop what you dropped, however many passes run', () => {
    const dropped = [entry('Hoisting', { status: 'dropped', reason: 'not a concept' })]

    const twice = mergeCoverage(
      mergeCoverage(dropped, [entry('Hoisting', { pass: 2 })]),
      [entry('Hoisting', { pass: 3 })],
    )

    expect(twice).toHaveLength(1)
    expect(twice[0].status).toBe('dropped')
  })

  it('matches on the normalised title, so punctuation is not a second row', () => {
    const merged = mergeCoverage([entry('The module pattern')], [entry('The module pattern!')])

    expect(merged).toHaveLength(1)
  })

  it('round-trips through the stored shape', () => {
    /*
      The assertion that would have caught `topicId` being written where
      `topic_id` is read — a mismatch jsonb accepts silently and no layer
      reports. Serialise, parse, and require the domain object back.
    */
    const original = [
      entry('Closures', { timestamp: '05:31', topicId: 'abc', pass: 2, partial: true }),
      entry('Hoisting', { status: 'dropped', reason: 'already in your library — Hoisting' }),
    ]

    expect(parseCoverage(coverageToRows(original))).toEqual(original)
  })

  it('renders a malformed column as empty rather than throwing', () => {
    // A record that takes the page down with it is worse than one that is missing.
    expect(parseCoverage(null)).toEqual([])
    expect(parseCoverage('not an array')).toEqual([])
    expect(parseCoverage([{ nothing: 'useful' }, null, 7])).toEqual([])
  })

  it('counts what the coverage screen shows', () => {
    const summary = coverageSummary([
      entry('A'),
      entry('B', { status: 'dropped' }),
      entry('C', { partial: true }),
    ])

    expect(summary).toEqual({ found: 3, kept: 2, dropped: 1, partial: true })
  })
})
