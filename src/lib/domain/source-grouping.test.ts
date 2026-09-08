import { describe, expect, it } from 'vitest'
import {
  groupSources,
  groupedHeadline,
  practisableScopes,
} from '@/lib/domain/source-grouping'
import type { SourceSummary, SourceWithEntriesView } from '@/lib/domain/sources'
import { makeTopic } from '@/lib/domain/topic-fixture'

let seq = 0

function view(
  overrides: Partial<SourceSummary> & { entries?: number } = {},
): SourceWithEntriesView {
  const { entries = 0, ...source } = overrides
  seq += 1

  return {
    source: {
      id: `s${seq}`,
      user_id: 'u1',
      lesson: `Lesson ${seq}`,
      course: null,
      chapter: null,
      duration_seconds: null,
      url: null,
      transcript_words: null,
      transcript_deleted_at: null,
      coverage: [],
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      ...source,
    },
    entries: Array.from({ length: entries }, (_, index) =>
      makeTopic({ id: `${seq}-${index}`, title: `Entry ${index}` }),
    ),
  }
}

describe('grouping course → chapter → lesson', () => {
  it('nests a course, its chapters, and their lessons', () => {
    const grouped = groupSources([
      view({ course: 'Hard Parts', chapter: 'Principles', lesson: 'Execution Context' }),
      view({ course: 'Hard Parts', chapter: 'Principles', lesson: 'Call Stack' }),
      view({ course: 'Hard Parts', chapter: 'Callbacks', lesson: 'Higher Order Functions' }),
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].course).toBe('Hard Parts')
    expect(grouped[0].lessons).toBe(3)
    // Both chapters share a created_at here, so this is the NAME tiebreak, not
    // recency — added after this very assertion fell back to Map insertion order.
    expect(grouped[0].chapters.map((c) => c.chapter)).toEqual(['Callbacks', 'Principles'])
  })

  it('puts lessons with no course LAST, and does not call the absence a course', () => {
    const grouped = groupSources([
      view({ lesson: 'A conference talk' }),
      view({ course: 'Hard Parts', lesson: 'Execution Context' }),
    ])

    expect(grouped.map((node) => node.course)).toEqual(['Hard Parts', null])

    /*
      A conference talk is a real source and should not need a course invented
      for it — but "No course" is the absence of the grouping key, so the head
      must not count it as one. The mock's header said "2 courses" for exactly
      this shape.
    */
    expect(groupedHeadline(grouped)).toBe(
      '1 course · 1 without one · 2 lessons · 0 entries distilled',
    )
  })

  it('keeps lessons with no chapter inside their course', () => {
    const grouped = groupSources([
      view({ course: 'Hard Parts', chapter: 'Principles', lesson: 'Execution Context' }),
      view({ course: 'Hard Parts', lesson: 'An aside with no chapter' }),
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].chapters.map((c) => c.chapter)).toContain(null)
    expect(grouped[0].lessons).toBe(2)
  })
})

describe('the two orderings, which are different on purpose', () => {
  it('orders lessons within a chapter OLDEST first — syllabus order', () => {
    /*
      You add lessons as you watch them, so ascending is the order of the course
      itself and the next one to watch is at the bottom. The mock drew these
      newest-first while its own principle was that the list reads "the way the
      course sidebar reads" — and a sidebar is syllabus order.
    */
    const grouped = groupSources([
      view({ course: 'C', chapter: 'Ch', lesson: 'Third', created_at: '2026-09-03T00:00:00.000Z' }),
      view({ course: 'C', chapter: 'Ch', lesson: 'First', created_at: '2026-09-01T00:00:00.000Z' }),
      view({ course: 'C', chapter: 'Ch', lesson: 'Second', created_at: '2026-09-02T00:00:00.000Z' }),
    ])

    expect(grouped[0].chapters[0].lessons.map((l) => l.view.source.lesson)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('orders courses and chapters NEWEST first — navigation', () => {
    // The outer levels are navigation: what you are working on now, at the top.
    const grouped = groupSources([
      view({ course: 'Older', lesson: 'x', created_at: '2026-09-01T00:00:00.000Z' }),
      view({ course: 'Newer', lesson: 'y', created_at: '2026-09-05T00:00:00.000Z' }),
    ])

    expect(grouped.map((node) => node.course)).toEqual(['Newer', 'Older'])

    const chapters = groupSources([
      view({ course: 'C', chapter: 'Older', lesson: 'x', created_at: '2026-09-01T00:00:00.000Z' }),
      view({ course: 'C', chapter: 'Newer', lesson: 'y', created_at: '2026-09-05T00:00:00.000Z' }),
    ])

    expect(chapters[0].chapters.map((c) => c.chapter)).toEqual(['Newer', 'Older'])
  })

  it('breaks a tie by id, so two lessons added in one second never swap', () => {
    const same = '2026-09-01T00:00:00.000Z'
    const grouped = groupSources([
      view({ course: 'C', chapter: 'Ch', lesson: 'B', created_at: same }),
      view({ course: 'C', chapter: 'Ch', lesson: 'A', created_at: same }),
    ])

    const first = grouped[0].chapters[0].lessons.map((l) => l.view.source.id)
    expect(first).toEqual([...first].sort())
  })
})

describe('the counts, which are counted rather than estimated', () => {
  it('sums lengths across a chapter and a course, skipping the unknown ones', () => {
    const grouped = groupSources([
      view({ course: 'C', chapter: 'Ch', duration_seconds: 803 }),
      view({ course: 'C', chapter: 'Ch', duration_seconds: null }),
      view({ course: 'C', chapter: 'Other', duration_seconds: 415 }),
    ])

    expect(grouped[0].seconds).toBe(1218)
    expect(grouped[0].chapters.find((c) => c.chapter === 'Ch')?.seconds).toBe(803)
  })

  it('counts lessons that produced something, and never a percentage', () => {
    const grouped = groupSources([
      view({ course: 'C', entries: 4 }),
      view({ course: 'C', entries: 0 }),
      view({ course: 'C', entries: 2 }),
    ])

    expect(grouped[0].mined).toBe(2)
    expect(grouped[0].entries).toBe(6)

    /*
      There is deliberately no ratio and no bar. The app knows how many lessons
      you have ADDED, never how many the course has — a course that is 8 of 42
      lessons might be a third of the hours or a twentieth. The mock drew a bar
      at 62% beside "3 of 5 mined", which is 60%, and its own rules tab forbids
      the bar entirely.
    */
    expect(Object.keys(grouped[0])).not.toContain('percent')
    expect(Object.keys(grouped[0])).not.toContain('progress')
  })

  it('reads as English at one of everything', () => {
    expect(groupedHeadline(groupSources([view({ course: 'C', entries: 1 })]))).toBe(
      '1 course · 1 lesson · 1 entry distilled',
    )
  })

  it('carries the duration total, which is the point of having added length', () => {
    /*
      A count of lessons flatters and a total of hours does not — that is the
      whole reason both are on the head. It was missing from the first build of
      this screen.
    */
    expect(
      groupedHeadline(
        groupSources([
          view({ course: 'C', duration_seconds: 803, entries: 21 }),
          view({ course: 'C', duration_seconds: null }),
        ]),
      ),
    ).toBe('1 course · 2 lessons · 13m 23s of lessons · 21 entries distilled')
  })

  it('omits the total when no lesson has a length, rather than showing a zero', () => {
    expect(groupedHeadline(groupSources([view({ course: 'C' })]))).toBe(
      '1 course · 1 lesson · 0 entries distilled',
    )
  })
})

describe('never two actions producing the same session', () => {
  /*
    One general rule — if two scopes resolve to the same set of topic ids, show
    the widest — so "one chapter" and "one lesson" are consequences rather than
    two special cases someone has to remember.
  */
  const course = (ids: string[]) => ({ key: 'course', level: 'course' as const, ids })
  const chapter = (name: string, ids: string[]) => ({
    key: `chapter:${name}`,
    level: 'chapter' as const,
    ids,
  })
  const lesson = (name: string, ids: string[]) => ({
    key: `lesson:${name}`,
    level: 'lesson' as const,
    ids,
  })

  it('a course with ONE chapter shows only the course', () => {
    const visible = practisableScopes([course(['a', 'b']), chapter('Principles', ['a', 'b'])])

    expect([...visible]).toEqual(['course'])
  })

  it('a course with TWO chapters shows all three', () => {
    const visible = practisableScopes([
      course(['a', 'b', 'c']),
      chapter('Principles', ['a', 'b']),
      chapter('Callbacks', ['c']),
    ])

    expect(visible.has('course')).toBe(true)
    expect(visible.has('chapter:Principles')).toBe(true)
    expect(visible.has('chapter:Callbacks')).toBe(true)
  })

  it('a chapter with ONE lesson shows only the chapter — the same rule, one level down', () => {
    const visible = practisableScopes([
      course(['a', 'b', 'c']),
      chapter('Principles', ['a']),
      lesson('Execution Context', ['a']),
      chapter('Callbacks', ['b', 'c']),
    ])

    expect(visible.has('chapter:Principles')).toBe(true)
    expect(visible.has('lesson:Execution Context')).toBe(false)
  })

  it('shows nothing at all when there is nothing to practise', () => {
    // Absent, not disabled. A session of zero entries is not a session.
    expect([...practisableScopes([course([]), chapter('Empty', [])])]).toEqual([])
  })

  it('does not care what order the ids arrived in', () => {
    // The identity of a session is its SET, so a different order is the same
    // session and must still collapse.
    const visible = practisableScopes([course(['b', 'a']), chapter('One', ['a', 'b'])])

    expect([...visible]).toEqual(['course'])
  })
})