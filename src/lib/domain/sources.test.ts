import { describe, expect, it } from 'vitest'
import {
  definitionFromSelection,
  deleteSourceCopy,
  extractionCount,
  extractionsFor,
  isUndistilled,
  transcriptState,
  UNDISTILLED_WINDOW_DAYS,
} from '@/lib/domain/sources'
import { parseSourceForm } from '@/lib/domain/source-form'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'

const source = (overrides: Partial<{ caveat_noted: boolean; created_at: string }> = {}) => ({
  caveat_noted: false,
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const detailOf = (kind: string, entries: Parameters<typeof extractionsFor>[1]) =>
  extractionsFor(source(), entries).find((e) => e.kind === kind)

describe('the five extractions', () => {
  it('a source with nothing has none of them', () => {
    const five = extractionsFor(source(), [])

    expect(five).toHaveLength(5)
    expect(five.every((extraction) => !extraction.done)).toBe(true)
    expect(extractionCount(source(), [])).toBe(0)

    // The empty states carry their own words rather than a bare zero.
    expect(detailOf('definition', [])?.detail).toBe('no topics yet')
    expect(detailOf('mental-model', [])?.detail).toBe('—')
    expect(detailOf('challenge', [])?.detail).toBe('no evidence yet')
    expect(detailOf('retrieval', [])?.detail).toBe('0 of 3 quizzes')
    expect(detailOf('caveat', [])?.detail).toBe('tick when written')
  })

  it('a source with all five has all of them', () => {
    const entries = [
      makeTopic({ id: 't1', mental_model: 'The backpack.', challenge_at: '2026-09-02', challenge_note: 'built it' }),
      makeTopic({ id: 't2', mental_model: 'A live reference.' }),
      makeQuiz({ id: 'q1' }),
      makeQuiz({ id: 'q2' }),
      makeQuiz({ id: 'q3' }),
    ]
    const withCaveat = source({ caveat_noted: true })

    expect(extractionCount(withCaveat, entries)).toBe(5)
    expect(extractionsFor(withCaveat, entries).every((e) => e.done)).toBe(true)
  })

  it('counts topics and quizzes separately', () => {
    // Three quizzes and no topics is NOT a definition.
    const quizzesOnly = [makeQuiz({ id: 'q1' }), makeQuiz({ id: 'q2' }), makeQuiz({ id: 'q3' })]

    expect(detailOf('definition', quizzesOnly)?.done).toBe(false)
    expect(detailOf('retrieval', quizzesOnly)?.done).toBe(true)
  })

  it('needs three quizzes for the retrieval questions, not one', () => {
    const two = [makeQuiz({ id: 'q1' }), makeQuiz({ id: 'q2' })]

    expect(detailOf('retrieval', two)?.done).toBe(false)
    expect(detailOf('retrieval', two)?.detail).toBe('2 of 3 quizzes')
  })

  it('reads a mental model only from topics that have one', () => {
    const entries = [makeTopic({ id: 't1', mental_model: 'Yes.' }), makeTopic({ id: 't2', mental_model: null })]

    expect(detailOf('mental-model', entries)?.detail).toBe('1 of 2')
    expect(detailOf('mental-model', entries)?.done).toBe(true)
    expect(detailOf('mental-model', [makeTopic({ id: 't', mental_model: '   ' })])?.done).toBe(false)
  })

  it("reads arc 1's challenge evidence on any linked topic", () => {
    /*
      The third extraction is derived from the evidence arc, not from a second
      store. A challenge recorded on ANY linked topic satisfies it.
    */
    const none = [makeTopic({ id: 't1' })]
    const one = [
      makeTopic({ id: 't1' }),
      makeTopic({ id: 't2', challenge_at: '2026-09-02', challenge_note: 'a constrained variant' }),
    ]

    expect(detailOf('challenge', none)?.done).toBe(false)
    expect(detailOf('challenge', one)?.done).toBe(true)
    expect(detailOf('challenge', one)?.detail).toBe('1 recorded')
  })

  it('marks exactly one as manual — the exception, labelled', () => {
    const five = extractionsFor(source(), [])

    expect(five.filter((extraction) => extraction.manual).map((e) => e.kind)).toEqual(['caveat'])
  })

  it('cannot be gamed: the tick does not satisfy the four derived ones', () => {
    expect(extractionCount(source({ caveat_noted: true }), [])).toBe(1)
  })
})

describe('the transcript states', () => {
  it('tells present from deleted from never', () => {
    expect(transcriptState({ transcript_words: 8400, transcript_deleted_at: null })).toBe('present')
    expect(transcriptState({ transcript_words: null, transcript_deleted_at: '2026-09-05' })).toBe('deleted')
    expect(transcriptState({ transcript_words: null, transcript_deleted_at: null })).toBe('none')
  })
})

describe('a source that has taught you nothing', () => {
  const now = new Date('2026-09-20T00:00:00.000Z')

  it('is not called out while it has produced something', () => {
    expect(isUndistilled({ created_at: '2026-01-01T00:00:00.000Z' }, 1, now)).toBe(false)
  })

  it('is not called out before the fortnight', () => {
    const thirteenDays = new Date(now.getTime() - 13 * 86_400_000).toISOString()
    expect(isUndistilled({ created_at: thirteenDays }, 0, now)).toBe(false)
  })

  it('is called out on the fourteenth day — the boundary belongs to the called-out side', () => {
    const exactly = new Date(now.getTime() - UNDISTILLED_WINDOW_DAYS * 86_400_000).toISOString()
    expect(isUndistilled({ created_at: exactly }, 0, now)).toBe(true)
  })
})

describe('selecting transcript text', () => {
  it('produces a definition and nothing else', () => {
    /*
      The rule that separates this from a note-taking app. The return type is the
      enforcement: there is no field here to put a mental model in.
    */
    const result = definitionFromSelection('  A returned function carries\n  a live reference.  ')

    expect(result).toEqual({ definition: 'A returned function carries a live reference.' })
    expect(Object.keys(result)).toEqual(['definition'])
    expect(result).not.toHaveProperty('mental_model')
  })
})

describe('parseSourceForm', () => {
  const form = (overrides = {}) => ({ title: 'Closures', course: '', url: '', transcript: '', ...overrides })

  it('needs a title and nothing else', () => {
    expect(parseSourceForm(form()).value).toEqual({
      title: 'Closures',
      course: null,
      url: null,
      transcript: null,
    })
  })

  it('rejects a blank title', () => {
    expect(parseSourceForm(form({ title: '   ' })).error).toContain('Give the source a title')
  })

  it('turns blank optionals into null rather than empty strings', () => {
    // The CHECK constraints reject '' — absence is null.
    const parsed = parseSourceForm(form({ course: '  ', url: '', transcript: '   ' }))
    expect(parsed.value).toMatchObject({ course: null, url: null, transcript: null })
  })

  it('refuses a link that is not http or https', () => {
    expect(parseSourceForm(form({ url: 'javascript:alert(1)' })).error).toContain('http or https')
    expect(parseSourceForm(form({ url: 'frontendmasters.com' })).error).toContain('not a URL')
  })
})


describe('the counts read as English', () => {
  /*
    "1 topics" shipped to production. The count is the first thing you look at on
    this screen, so a number that disagrees with its noun undermines the one
    thing the screen is for.
  */
  it('singularises the definition detail at one topic', () => {
    expect(detailOf('definition', [])?.detail).toBe('no topics yet')
    expect(detailOf('definition', [makeTopic({})])?.detail).toBe('1 topic')
    expect(detailOf('definition', [makeTopic({}), makeTopic({})])?.detail).toBe('2 topics')
  })
})

describe('what the delete confirmation says', () => {
  /*
    Three things have to agree with the count — the noun, the verb and the
    pronoun. Only the noun did: at one entry it read "The 1 entry you distilled
    from it stay in your library — they lose the line saying where they came
    from."
  */
  it('makes a claim about nothing when nothing was distilled', () => {
    const copy = deleteSourceCopy(0)

    expect(copy.kept).toBe('Nothing has been distilled from it yet')
    // No consequence clause: there is no line for nothing to lose.
    expect(copy.lost).toBe('')
  })

  it('agrees throughout at one entry', () => {
    const copy = deleteSourceCopy(1)

    expect(copy.kept).toBe('The 1 entry you distilled from it stays in your library')
    expect(copy.lost).toBe('it loses the line saying where it came from')

    for (const wrong of [' stay in', 'entries', 'they lose', 'they came']) {
      expect(`${copy.kept} ${copy.lost}`).not.toContain(wrong)
    }
  })

  it('agrees throughout at more than one', () => {
    const copy = deleteSourceCopy(2)

    expect(copy.kept).toBe('The 2 entries you distilled from it stay in your library')
    expect(copy.lost).toBe('they lose the line saying where they came from')

    for (const wrong of ['stays in', '1 entry ', 'it loses']) {
      expect(`${copy.kept} ${copy.lost}`).not.toContain(wrong)
    }
  })
})
