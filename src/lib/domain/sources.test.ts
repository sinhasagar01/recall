import { describe, expect, it } from 'vitest'
import {
  definitionFromSelection,
  deleteSourceCopy,
  isUndistilled,
  sourceProgress,
  sourceProgressCopy,
  transcriptState,
  UNDISTILLED_WINDOW_DAYS,
} from '@/lib/domain/sources'
import { parseSourceForm } from '@/lib/domain/source-form'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'

const source = (overrides: Partial<{ created_at: string }> = {}) => ({
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

/**
 * What replaced the five-item extraction checklist.
 *
 * The checklist was a PROXY for whether you had mined a video — four items
 * derived from linked entries and one ticked by hand. Arc 6 replaced it with the
 * thing itself: what the source produced, and how well you know it. Nothing is
 * ticked, so there is nothing left that can be gamed.
 */
describe('what a source has produced', () => {
  it('a source with nothing says so, rather than counting to zero', () => {
    expect(sourceProgressCopy(sourceProgress([]))).toBe('nothing extracted yet')
  })

  it('counts topics and quizzes separately, and agrees at one', () => {
    // "1 topics" shipped to production once. The agreement lives here.
    expect(sourceProgressCopy(sourceProgress([makeTopic({ id: 't1', confidence: 'okay' })]))).toBe(
      '1 topic',
    )
    expect(
      sourceProgressCopy(
        sourceProgress([
          makeTopic({ id: 't1', confidence: 'okay' }),
          makeTopic({ id: 't2', confidence: 'okay' }),
          makeQuiz({ id: 'q1', confidence: 'okay' }),
        ]),
      ),
    ).toBe('2 topics · 1 quiz')
  })

  it('names what still needs work, and stays silent when nothing does', () => {
    const settled = [makeTopic({ id: 't1', confidence: 'strong' })]
    expect(sourceProgressCopy(sourceProgress(settled))).toBe('1 topic')

    const mixed = [
      makeTopic({ id: 't1', confidence: 'strong' }),
      makeTopic({ id: 't2', confidence: 'new' }),
      makeTopic({ id: 't3', confidence: 'weak' }),
    ]
    expect(sourceProgressCopy(sourceProgress(mixed))).toBe('3 topics · 1 never practised · 1 weak')
  })

  it('is done when every entry is okay or better', () => {
    expect(sourceProgress([]).done).toBe(false)
    expect(sourceProgress([makeTopic({ id: 't1', confidence: 'new' })]).done).toBe(false)
    expect(sourceProgress([makeTopic({ id: 't1', confidence: 'weak' })]).done).toBe(false)

    /*
      "The video is finished with you rather than the other way round." Done is
      derived from confidence alone — there is no tick, and no way to claim it.
    */
    expect(
      sourceProgress([
        makeTopic({ id: 't1', confidence: 'okay' }),
        makeQuiz({ id: 'q1', confidence: 'strong' }),
      ]).done,
    ).toBe(true)
  })

  it('reuses the confidence rules rather than restating them', () => {
    // never practised is `new`, weak is `weak` — and a topic is never both.
    const progress = sourceProgress([
      makeTopic({ id: 't1', confidence: 'new' }),
      makeTopic({ id: 't2', confidence: 'weak' }),
    ])

    expect(progress.neverPractised).toBe(1)
    expect(progress.weak).toBe(1)
    expect(progress.topics).toBe(2)
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
  const form = (overrides = {}) => ({
    lesson: 'Closures',
    course: '',
    chapter: '',
    length: '',
    url: '',
    transcript: '',
    ...overrides,
  })

  it('needs a lesson and nothing else', () => {
    expect(parseSourceForm(form()).value).toEqual({
      lesson: 'Closures',
      course: null,
      chapter: null,
      duration_seconds: null,
      url: null,
      transcript: null,
    })
  })

  it('rejects a blank lesson', () => {
    expect(parseSourceForm(form({ lesson: '   ' })).error).toContain('Name the lesson')
  })

  it('turns blank optionals into null rather than empty strings', () => {
    // The CHECK constraints reject '' — absence is null.
    const parsed = parseSourceForm(
      form({ course: '  ', chapter: '  ', url: '', transcript: '   ' }),
    )
    expect(parsed.value).toMatchObject({ course: null, chapter: null, url: null, transcript: null })
  })

  it('refuses a link that is not http or https', () => {
    expect(parseSourceForm(form({ url: 'javascript:alert(1)' })).error).toContain('http or https')
    expect(parseSourceForm(form({ url: 'frontendmasters.com' })).error).toContain('not a URL')
  })

  it('stores the length as seconds, and refuses one it cannot read', () => {
    expect(parseSourceForm(form({ length: '13m 23s' })).value?.duration_seconds).toBe(803)
    expect(parseSourceForm(form({ length: '90' })).value?.duration_seconds).toBe(5400)

    // Never zero. The parse fails loudly rather than storing a lesson that took
    // no time — see duration.ts.
    expect(parseSourceForm(form({ length: 'banana' })).error).toContain('Not a length')
    expect(parseSourceForm(form({ length: '0' })).error).toContain('Not a length')
  })

  it('refuses a chapter with no course', () => {
    /*
      A chapter of nothing would group under "No course" and read as though the
      course had been lost rather than never given. Refused where the mistake was
      made, not silently dropped.
    */
    expect(parseSourceForm(form({ chapter: 'Principles' })).error).toContain('belongs to a course')
    expect(
      parseSourceForm(form({ chapter: 'Principles', course: 'JS: The Hard Parts' })).error,
    ).toBeUndefined()
  })
})


describe('the counts read as English', () => {
  /*
    "1 topics" shipped to production. The count is the first thing you look at on
    this screen, so a number that disagrees with its noun undermines the one
    thing the screen is for.
  */
  it('singularises every noun in the summary, at one', () => {
    /*
      Carried across from the five-item checklist, which is what shipped the
      defect. The surface changed; the lesson did not, so the assertion moved to
      the function that replaced it rather than being deleted with it.
    */
    const one = sourceProgressCopy(
      sourceProgress([makeTopic({ id: 't', confidence: 'new' }), makeQuiz({ id: 'q', confidence: 'new' })]),
    )

    expect(one).toBe('1 topic · 1 quiz · 2 never practised')
    for (const wrong of ['1 topics', '1 quizzes', '1 never practiseds']) {
      expect(one).not.toContain(wrong)
    }

    expect(
      sourceProgressCopy(
        sourceProgress([makeQuiz({ id: 'q1', confidence: 'okay' }), makeQuiz({ id: 'q2', confidence: 'okay' })]),
      ),
    ).toBe('2 quizzes')
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
