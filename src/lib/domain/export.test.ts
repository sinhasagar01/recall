import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  exportFilename,
  imageEntryName,
  renderLibraryMarkdown,
} from '@/lib/domain/export'
import type { SourceSummary } from '@/lib/domain/sources'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'
import type { Topic } from '@/lib/domain/types'

const NOW = new Date('2026-09-05T18:40:00.000Z')

/* Stands in for the thing that must never reach the file. */
const TRANSCRIPT_BODY = 'A closure is the combination of a function and its lexical environment.'

const render = (topics: Topic[], missing: string[] = []) =>
  renderLibraryMarkdown(topics, { exportedAt: NOW, missingPaths: new Set(missing) })


describe('exportFilename', () => {
  it('carries the date, so two exports do not collide in a downloads folder', () => {
    expect(exportFilename(NOW)).toBe('recall-2026-09-05.zip')
  })

  it('uses UTC, so the name does not depend on where the server is', () => {
    expect(exportFilename(new Date('2026-01-01T23:30:00.000Z'))).toBe('recall-2026-01-01.zip')
  })
})

describe('imageEntryName', () => {
  it('is a path under images/, keyed by topic so two files cannot collide', () => {
    const topic = makeTopic({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      mental_model_image_path: 'user/topic/diagram.png',
    })
    expect(imageEntryName(topic)).toBe('images/aaaaaaaa-0000-4000-8000-000000000001-diagram.png')
  })

  it('is null when the topic has no image', () => {
    expect(imageEntryName(makeTopic({ mental_model_image_path: null }))).toBeNull()
  })
})

/*
  The three rows most likely to produce a broken line or a dangling reference:
  one with no image, one with an image, one with a null mental model.
*/
const withImage: Topic = makeTopic({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: 'Reconciliation',
  definition: 'React diffs the new tree against the previous one.',
  mental_model: 'Position by position, not by identity.',
  category: 'React',
  tags: ['rendering', 'core'],
  confidence: 'strong',
  practice_count: 8,
  last_practiced_at: '2026-09-01T09:00:00.000Z',
  mental_model_image_path: 'user/topic/diagram.png',
})

const noImage: Topic = makeTopic({
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  title: 'Closures',
  definition: 'A function keeps a live reference to the scope it was defined in.',
  mental_model: 'It carries its birthplace around with it.',
  category: 'JavaScript',
  tags: ['scope'],
  confidence: 'okay',
  practice_count: 2,
  last_practiced_at: '2026-08-20T09:00:00.000Z',
})

const noMentalModel: Topic = makeTopic({
  id: 'aaaaaaaa-0000-4000-8000-000000000003',
  title: 'CORS preflight',
  definition: 'A non-simple cross-origin request sends OPTIONS first.',
  mental_model: null,
  category: null,
  tags: [],
  confidence: 'new',
  practice_count: 0,
  last_practiced_at: null,
})

describe('renderLibraryMarkdown', () => {
  it('follows the detail page order: title, category and tags, definition, mental model, then practice', () => {
    const md = render([withImage])
    const at = (needle: string) => md.indexOf(needle)

    expect(at('# Reconciliation')).toBeGreaterThan(-1)
    expect(at('React · rendering, core')).toBeGreaterThan(at('# Reconciliation'))
    expect(at('React diffs')).toBeGreaterThan(at('React · rendering, core'))
    expect(at('Position by position')).toBeGreaterThan(at('React diffs'))
    expect(at('Strong')).toBeGreaterThan(at('Position by position'))
  })

  it('references the image by its path inside the zip', () => {
    expect(render([withImage])).toContain('images/aaaaaaaa-0000-4000-8000-000000000001-diagram.png')
  })

  it('says nothing about an image when the topic has none', () => {
    const md = render([noImage])
    expect(md).not.toContain('images/')
    expect(md).not.toContain('Visual')
  })

  it('omits the mental model heading entirely when it is null', () => {
    const md = render([noMentalModel])
    expect(md).toContain('# CORS preflight')
    expect(md).toContain('A non-simple cross-origin request')
    expect(md).not.toContain('Mental model')
    // No empty category or tag line either.
    expect(md).toContain('Uncategorized')
  })

  it('renders all three shapes in one document without losing any', () => {
    const md = render([withImage, noImage, noMentalModel])
    expect(md).toContain('# Reconciliation')
    expect(md).toContain('# Closures')
    expect(md).toContain('# CORS preflight')
    expect(md).toContain('3 topics')
  })

  it('says never practiced rather than printing a null', () => {
    const md = render([noMentalModel])
    expect(md).toContain('never practiced')
    expect(md).not.toContain('null')
  })

  it('names a missing image inline and in a summary, rather than dangling', () => {
    const md = render([withImage], ['user/topic/diagram.png'])

    // Summarised at the top, so it is seen without hunting.
    expect(md).toContain('1 image could not be exported')
    // And called out on the topic it belongs to.
    expect(md).toContain('image was missing from storage')
    // The dangling reference is NOT written.
    expect(md).not.toContain('images/aaaaaaaa-0000-4000-8000-000000000001-diagram.png')
  })

  it('says so plainly when the library is empty', () => {
    expect(render([])).toContain('No topics')
  })
})

describe('a quiz in library.md', () => {
  const quiz = makeQuiz({
    title: 'What runs first — a promise or a timeout?',
    options: [
      'The promise — microtasks drain before the next macrotask',
      'The timeout — a zero delay is always immediate',
      "Depends on the browser's scheduler",
    ],
    correct_option: 0,
    mental_model: 'The microtask queue empties completely between macrotasks.',
    category: 'JavaScript',
    tags: ['async', 'event-loop'],
    confidence: 'weak',
  })

  it('renders the question as the heading and the options as a list', () => {
    const out = render([quiz])

    expect(out).toContain('# What runs first — a promise or a timeout?')
    expect(out).toContain('## Options')
    expect(out).toContain('1. The promise — microtasks drain before the next macrotask  ← the answer')
    expect(out).toContain('2. The timeout — a zero delay is always immediate')
    expect(out).toContain("3. Depends on the browser's scheduler")
  })

  it('marks exactly one answer, and marks the stored one', () => {
    const out = render([makeQuiz({ options: ['a', 'b', 'c'], correct_option: 2 })])

    expect(out.match(/← the answer/g)).toHaveLength(1)
    expect(out).toContain('3. c  ← the answer')
    expect(out).not.toContain('1. a  ← the answer')
  })

  it('keeps the stored order rather than a shuffled one', () => {
    /*
      The shuffle belongs to a practice session. If the export shuffled, two
      exports of the same library would differ and neither would match the row.
    */
    const out = render([quiz])
    const positions = ['The promise', 'The timeout', "Depends on"].map((text) => out.indexOf(text))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('has no Definition section and no image section', () => {
    const out = render([quiz])

    expect(out).not.toContain('## Definition')
    expect(out).not.toContain('## Visual')
  })

  it('names the explanation Why, not Mental model', () => {
    const out = render([quiz])

    expect(out).toContain('## Why')
    expect(out).not.toContain('## Mental model')
    expect(out).toContain('The microtask queue empties completely between macrotasks.')
  })

  it('carries the same practice line a topic does', () => {
    expect(render([quiz])).toContain('Weak · never practiced · practiced 0 times')
  })

  it('counts both shapes at the top rather than calling everything a topic', () => {
    expect(render([quiz])).toContain('1 quiz, exported')
    expect(render([makeTopic({})])).toContain('1 topic, exported')
    expect(render([makeTopic({}), makeTopic({}), quiz])).toContain('2 topics and 1 quiz, exported')
  })
})

describe('evidence in library.md', () => {
  const marked = makeTopic({
    title: 'Debouncing a scroll handler',
    definition: 'Collapse a burst of events into one call.',
    mental_model: 'The lift doors that keep reopening.',
    rebuild_at: '2026-08-28',
    rebuild_note: 'debounce() from memory',
    rebuild_url: 'https://gist.github.com/x',
    challenge_at: '2026-09-01',
    challenge_note: 'Stale search responses',
    production_at: '2026-09-04',
    production_note: 'Search cancellation in the capstone',
    production_url: 'https://example.com/adr-002',
  })

  it('renders one line per marker, in row order, with the link when there is one', () => {
    const out = render([marked])

    expect(out).toContain('## Evidence')
    expect(out).toContain('- **Rebuild** — Aug 28 — debounce() from memory — https://gist.github.com/x')
    expect(out).toContain('- **Challenge** — Sep 1 — Stale search responses')
    expect(out).toContain(
      '- **Production** — Sep 4 — Search cancellation in the capstone — https://example.com/adr-002',
    )
  })

  it('omits the link when there is none, rather than trailing an empty dash', () => {
    const out = render([marked])
    expect(out).not.toContain('Stale search responses — \n')
    expect(out).not.toContain('Stale search responses —\n')
  })

  it('sits after the mental model and before the practice line, as the detail page does', () => {
    const out = render([marked])
    expect(out.indexOf('## Mental model')).toBeLessThan(out.indexOf('## Evidence'))
    expect(out.indexOf('## Evidence')).toBeLessThan(out.indexOf('Never practiced'))
  })

  it('is absent entirely when nothing is recorded', () => {
    /*
      The rule Definition and Visual already follow. A library with no evidence
      exports byte-identically to before this shipped, which is the test that the
      section costs nothing to anyone not using it.
    */
    expect(render([makeTopic({})])).not.toContain('## Evidence')
  })

  it('renders only the markers that exist', () => {
    const one = makeTopic({ rebuild_at: '2026-08-28', rebuild_note: 'once() from memory' })
    const out = render([one])

    expect(out).toContain('- **Rebuild**')
    expect(out).not.toContain('- **Challenge**')
    expect(out).not.toContain('- **Production**')
  })

  it('never renders evidence for a quiz', () => {
    // The constraint refuses the columns, so this is the same rule said twice.
    expect(render([makeQuiz({ options: ['a', 'b'], correct_option: 0 })])).not.toContain('## Evidence')
  })
})

describe('sources in library.md', () => {
  const closures: SourceSummary = {
    id: 'src-1',
    user_id: 'u1',
    title: 'JavaScript closures, in depth',
    course: 'JS: The Hard Parts',
    url: 'https://example.com/closures',
    transcript_words: 8400,
    transcript_deleted_at: null,
    caveat_noted: false,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
  }

  const topic = makeTopic({ id: 't1', title: 'Closure' })

  const withSources = (sources: SourceSummary[], sourceOf: Record<string, string> = {}) =>
    renderLibraryMarkdown([topic], {
      exportedAt: NOW,
      missingPaths: new Set<string>(),
      sources,
      sourceOf,
    })

  it('puts the source on the topic it produced', () => {
    const out = withSources([closures], { t1: 'src-1' })

    expect(out).toContain('## Where this came from')
    expect(out).toContain('JavaScript closures, in depth · JS: The Hard Parts — https://example.com/closures')
  })

  it('omits the section for a topic with no source', () => {
    expect(withSources([closures])).not.toContain('## Where this came from')
  })

  it('omits the whole section when there are no sources', () => {
    expect(render([topic])).not.toContain('# Sources')
  })

  /*
    The exception, asserted.

    library.json promises "every column, not a summary". Transcript bodies are the
    one deliberate exclusion, so the word count has to survive — a reader finding a
    source with a count and no text must be able to tell that was a decision rather
    than a bug. A test is the only thing that keeps that promise honest once someone
    changes the section.
  */
  it('exports the word count and never the transcript body', () => {
    /*
      The row is given a `transcript` it has no business carrying. `SourceSummary`
      omits the field, so this cannot happen through the type — but the export
      route hands over whatever the query returned, and a widened select list is
      exactly how a body would arrive. Passing one here asserts the renderer drops
      it rather than asserting the type system already did.
    */
    const leaky = { ...closures, transcript: TRANSCRIPT_BODY } as SourceSummary
    const out = withSources([leaky], { t1: 'src-1' })

    expect(out).toContain('8,400 words, not exported')
    expect(out).toMatch(/Transcript text is \*\*not\*\* exported/)
    expect(out).not.toContain(TRANSCRIPT_BODY)
  })

  it('is not read out of the database in the first place', () => {
    /*
      The other half, and the one that protects library.json — which is serialised
      straight from the query result, so the renderer above never sees it. The
      guarantee is the select list, asserted at the source the way the queue
      boundary is.
    */
    const read = readFileSync(join(process.cwd(), 'src/lib/data/export.ts'), 'utf8')
    const from = read.indexOf("from('sources')")
    const select = read.slice(from, read.indexOf("order('created_at'", from))

    expect(select, 'the export read must not select the transcript body').not.toMatch(
      /\btranscript\b(?!_words|_deleted_at)/,
    )
    expect(select, 'but must select the word count, so the omission is legible').toContain(
      'transcript_words',
    )
  })

  it('distinguishes a deleted transcript from one that never existed', () => {
    const deleted: SourceSummary = {
      ...closures,
      id: 'src-2',
      title: 'Deleted one',
      transcript_words: null,
      transcript_deleted_at: '2026-09-01T10:00:00.000Z',
    }
    const never: SourceSummary = {
      ...closures,
      id: 'src-3',
      title: 'Never had one',
      transcript_words: null,
      transcript_deleted_at: null,
    }

    const out = withSources([deleted, never])

    expect(out).toContain('transcript deleted')
    expect(out).toContain('no transcript')
  })

  it('reads a source with no course and no link without empty punctuation', () => {
    const bare: SourceSummary = { ...closures, course: null, url: null }
    const out = withSources([bare], { t1: 'src-1' })

    expect(out).toContain('JavaScript closures, in depth\n')
    expect(out).not.toContain('· null')
    expect(out).toContain('no link')
  })
})

describe('capabilities in library.md', () => {
  const caps = [
    { id: 'c1', name: 'Explain the event loop without notes', phase: 'Core foundations', demonstrated: true },
    { id: 'c2', name: 'Trace a click end to end', phase: 'Core foundations', demonstrated: false },
  ]

  const withCaps = (capabilityOf: Record<string, string> = {}) =>
    renderLibraryMarkdown([makeTopic({ id: 't1', title: 'Event loop' })], {
      exportedAt: NOW,
      missingPaths: new Set<string>(),
      capabilities: caps,
      capabilityOf,
    })

  it('puts the capability on the topic that serves it', () => {
    const out = withCaps({ t1: 'c1' })

    expect(out).toContain('## What this is for')
    expect(out).toContain('Explain the event loop without notes — Core foundations')
  })

  it('omits the section for a topic with no capability', () => {
    expect(withCaps()).not.toContain('## What this is for')
  })

  it('groups capabilities under their phase and marks the derived state', () => {
    const out = withCaps({ t1: 'c1' })

    expect(out).toContain('# Phases and capabilities')
    expect(out).toContain('## Core foundations')
    expect(out).toContain('- [demonstrated] Explain the event loop without notes')
    expect(out).toContain('- [not yet] Trace a click end to end')
  })

  it('says in the file that demonstrated is derived, never a flag anyone ticked', () => {
    /*
      Without this, a reader would reasonably assume `[demonstrated]` was a stored
      boolean someone ticked — the one thing the feature refuses. The file has to
      carry its own explanation, the way the transcript omission does.
    */
    expect(withCaps({ t1: 'c1' })).toMatch(/derived from your library every time, never a\nflag anyone ticked/)
  })

  it('omits the whole section when there are no capabilities', () => {
    expect(render([makeTopic({})])).not.toContain('# Phases and capabilities')
  })
})
