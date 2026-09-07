import { describe, expect, it } from 'vitest'
import {
  evidenceEntries,
  evidenceFor,
  hasEvidence,
  localDateString,
  parseEvidenceForm,
  takesEvidence,
  EVIDENCE_COLUMNS,
  EVIDENCE_KINDS,
} from '@/lib/domain/evidence'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'

const form = (overrides: Partial<{ note: string; at: string; url: string }> = {}) => ({
  note: 'once() from memory',
  at: '2026-08-28',
  url: '',
  ...overrides,
})

describe('localDateString', () => {
  /*
    The trap this exists to make impossible.

    `toISOString().slice(0, 10)` is UTC, so just after midnight anywhere east of
    Greenwich it returns YESTERDAY, and late evening in a western zone it returns
    TOMORROW. The dialog defaults to today because you record this when you do it,
    so it has to be the calendar the person is looking at.

    These two cases are the boundary. Both `Date`s are constructed with local
    components, which is exactly how a browser's clock reads.
  */
  it('is the local calendar date just after midnight, not the UTC one', () => {
    const justAfterMidnight = new Date(2026, 8, 7, 0, 30)
    expect(localDateString(justAfterMidnight)).toBe('2026-09-07')
  })

  it('is the local calendar date late in the evening, not the UTC one', () => {
    const lateEvening = new Date(2026, 8, 7, 23, 30)
    expect(localDateString(lateEvening)).toBe('2026-09-07')
  })

  it('pads a single-digit month and day', () => {
    expect(localDateString(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })

  it('takes the clock rather than reading it, so it can be tested at all', () => {
    // The same instant twice is the same answer: no hidden dependency on `now`.
    const fixed = new Date(2026, 8, 7, 12, 0)
    expect(localDateString(fixed)).toBe(localDateString(fixed))
  })
})

describe('parseEvidenceForm', () => {
  it('accepts a note and a date, with no link', () => {
    expect(parseEvidenceForm(form()).value).toEqual({
      at: '2026-08-28',
      note: 'once() from memory',
      url: null,
    })
  })

  it('keeps a link when one is given', () => {
    expect(parseEvidenceForm(form({ url: 'https://gist.github.com/x' })).value?.url).toBe(
      'https://gist.github.com/x',
    )
  })

  it('needs a note — a date on its own records nothing', () => {
    for (const note of ['', '   ']) {
      expect(parseEvidenceForm(form({ note })).error).toBe(
        'Say what you did — a date on its own records nothing.',
      )
    }
  })

  it('needs a real date', () => {
    for (const at of ['', 'yesterday', '28-08-2026', '2026-8-28']) {
      expect(parseEvidenceForm(form({ at })).error).toBe('Give the date you did it.')
    }
    expect(parseEvidenceForm(form({ at: '2026-02-31' })).error).toBe('That is not a real date.')
  })

  it('trims, so a note of spaces cannot reach the database', () => {
    // The CHECK rejects it too; this is the same rule said where it can be tested.
    expect(parseEvidenceForm(form({ note: '  built it  ' })).value?.note).toBe('built it')
  })

  it('refuses a link that is not http or https', () => {
    /*
      The link field is the entire integration with any document, so it is the one
      place a hostile string arrives. `javascript:` is stored as text and would
      later be rendered as an href.
    */
    expect(parseEvidenceForm(form({ url: 'javascript:alert(1)' })).error).toBe(
      'Links have to be http or https.',
    )
    expect(parseEvidenceForm(form({ url: 'gist.github.com/x' })).error).toContain('not a URL')
  })
})

describe('reading evidence off a topic', () => {
  const marked = makeTopic({
    rebuild_at: '2026-08-28',
    rebuild_note: 'once() from memory',
    rebuild_url: 'https://gist.github.com/x',
    production_at: '2026-09-04',
    production_note: 'Search cancellation in the capstone',
  })

  it('reads a recorded marker', () => {
    expect(evidenceFor(marked, 'rebuild')).toEqual({
      at: '2026-08-28',
      note: 'once() from memory',
      url: 'https://gist.github.com/x',
    })
  })

  it('is null for a marker never recorded', () => {
    expect(evidenceFor(marked, 'challenge')).toBeNull()
  })

  it('lists recorded markers in row order, skipping the absent ones', () => {
    expect(evidenceEntries(marked).map((e) => e.kind)).toEqual(['rebuild', 'production'])
  })

  it('says a bare topic has none, so the card draws no squares', () => {
    expect(hasEvidence(makeTopic({}))).toBe(false)
    expect(hasEvidence(marked)).toBe(true)
  })

  it('never treats a half-written marker as recorded', () => {
    /*
      Unreachable through the database — the coupling constraint rejects a date
      without a note — but the guard is what turns that guarantee into a type, and
      it should hold even if a row arrived some other way.
    */
    const halfWritten = makeTopic({ rebuild_at: '2026-08-28', rebuild_note: null })
    expect(evidenceFor(halfWritten, 'rebuild')).toBeNull()
    expect(hasEvidence(halfWritten)).toBe(false)
  })
})

describe('a quiz', () => {
  it('does not take evidence', () => {
    expect(takesEvidence(makeQuiz({}))).toBe(false)
    expect(takesEvidence(makeTopic({}))).toBe(true)
  })

  it('has none to read', () => {
    expect(evidenceEntries(makeQuiz({}))).toEqual([])
  })
})

describe('the column list', () => {
  it('is three per marker, derived rather than typed out', () => {
    // The boundary test greps for these. A rename that missed one would make that
    // test silently narrower, so the list has one definition.
    expect(EVIDENCE_COLUMNS).toHaveLength(EVIDENCE_KINDS.length * 3)
    expect(EVIDENCE_COLUMNS).toContain('rebuild_at')
    expect(EVIDENCE_COLUMNS).toContain('production_url')
  })
})
