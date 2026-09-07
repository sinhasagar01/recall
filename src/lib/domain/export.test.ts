import { describe, expect, it } from 'vitest'
import {
  exportFilename,
  imageEntryName,
  renderLibraryMarkdown,
} from '@/lib/domain/export'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'
import type { Topic } from '@/lib/domain/types'

const NOW = new Date('2026-09-05T18:40:00.000Z')

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
