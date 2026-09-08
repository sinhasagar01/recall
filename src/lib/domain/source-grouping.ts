import { totalDuration } from '@/lib/domain/duration'
import type { SourceWithEntriesView } from '@/lib/domain/sources'

/**
 * Course → chapter → lesson, from the two reads the list already does.
 *
 * Pure: it takes the sources and their entries and returns a tree. There is no
 * N+1 to avoid because nothing in here can reach a client — the shape of the
 * function is the guarantee.
 *
 * ── The two orderings are different on purpose ──────────────────────────────
 * The outer levels are **navigation** and the innermost is a **syllabus**, and
 * conflating them is why this looked like an inconsistency at first.
 *
 *   courses    most recent lesson first — what you are working on now, at the top
 *   chapters   most recent lesson first — same reason, and it matches the chapter
 *              combobox, which offers chapters by recency because you work
 *              through one over several sittings
 *   lessons    created_at ASCENDING — you add lessons as you watch them, so this
 *              is course order. A chapter reads like its own syllabus and the
 *              next lesson to watch is at the bottom.
 *
 * The mock drew lessons newest-first while its own stated principle was that the
 * list reads "the way the course sidebar reads" — and a sidebar is syllabus
 * order. Corrected in the file; see TASKS.md, where it is recorded as a sixth
 * way a reference can be wrong: its data contradicting its own words.
 */

/** The absence of a course, which is not a course named this. */
export const NO_COURSE = 'No course'

/** The absence of a chapter inside a course. */
export const NO_CHAPTER = 'No chapter'

export interface LessonNode {
  view: SourceWithEntriesView
}

export interface ChapterNode {
  /** Null means the lessons in this course that have no chapter. */
  chapter: string | null
  lessons: LessonNode[]
  entries: number
  seconds: number | null
}

export interface CourseNode {
  /** Null means the lessons with no course at all. */
  course: string | null
  chapters: ChapterNode[]
  lessons: number
  entries: number
  seconds: number | null
  /** Lessons that produced at least one entry. Never a percentage — see below. */
  mined: number
}

/**
 * Newest first, by the lesson most recently added, then by name.
 *
 * The name tiebreak is not decoration. Two courses whose newest lesson landed in
 * the same second would otherwise fall back to Map insertion order, which is the
 * order the rows came back from Postgres — stable enough to look fine in
 * development and free to change under you. The lessons already had a tiebreak;
 * this is the same rule at the outer levels, found by a test where every fixture
 * shared a timestamp.
 */
const byRecency = (a: { latest: number; key: string }, b: { latest: number; key: string }) =>
  b.latest - a.latest || a.key.localeCompare(b.key)

const latestOf = (views: SourceWithEntriesView[]) =>
  views.reduce((newest, view) => Math.max(newest, Date.parse(view.source.created_at)), 0)

export function groupSources(views: SourceWithEntriesView[]): CourseNode[] {
  const byCourse = new Map<string | null, SourceWithEntriesView[]>()
  for (const view of views) {
    const key = view.source.course
    byCourse.set(key, [...(byCourse.get(key) ?? []), view])
  }

  const courses: (CourseNode & { latest: number; key: string })[] = []

  for (const [course, courseViews] of byCourse) {
    const byChapter = new Map<string | null, SourceWithEntriesView[]>()
    for (const view of courseViews) {
      const key = view.source.chapter
      byChapter.set(key, [...(byChapter.get(key) ?? []), view])
    }

    const chapters: (ChapterNode & { latest: number; key: string })[] = []

    for (const [chapter, chapterViews] of byChapter) {
      /*
        Ascending here, and only here. Ties broken by id so the order is total —
        two lessons added in the same second must not swap between renders.
      */
      const lessons = [...chapterViews].sort((a, b) => {
        const byDate = Date.parse(a.source.created_at) - Date.parse(b.source.created_at)
        return byDate !== 0 ? byDate : a.source.id.localeCompare(b.source.id)
      })

      chapters.push({
        chapter,
        lessons: lessons.map((view) => ({ view })),
        entries: chapterViews.reduce((total, view) => total + view.entries.length, 0),
        seconds: totalDuration(chapterViews.map((view) => view.source.duration_seconds)),
        latest: latestOf(chapterViews),
        key: chapter ?? '',
      })
    }

    courses.push({
      course,
      chapters: chapters.sort(byRecency).map(({ latest: _l, key: _k, ...node }) => node),
      lessons: courseViews.length,
      entries: courseViews.reduce((total, view) => total + view.entries.length, 0),
      seconds: totalDuration(courseViews.map((view) => view.source.duration_seconds)),
      /*
        Lessons that produced something. NOT a percentage and not a bar: the app
        knows how many lessons you have ADDED, never how many the course has. A
        bar needs a denominator, and drawing one would be the first fake number
        in this product. The mock drew one at 62% beside "3 of 5 mined", which is
        60% — its own rules tab forbids it.
      */
      mined: courseViews.filter((view) => view.entries.length > 0).length,
      latest: latestOf(courseViews),
      key: course ?? '',
    })
  }

  /*
    "No course" last, always. It is the absence of the grouping key, not a course
    that happens to sort somewhere — a conference talk is a real source and
    should not need a course invented for it, but it also should not lead.
  */
  const named = courses.filter((node) => node.course !== null).sort(byRecency)
  const unnamed = courses.filter((node) => node.course === null)

  return [...named, ...unnamed].map(({ latest: _l, key: _k, ...node }) => node)
}

/** What the page head says, and it does not claim "No course" is a course. */
export function groupedHeadline(courses: CourseNode[]): string {
  const named = courses.filter((node) => node.course !== null)
  const loose = courses.find((node) => node.course === null)
  const lessons = courses.reduce((total, node) => total + node.lessons, 0)
  const entries = courses.reduce((total, node) => total + node.entries, 0)

  const parts: string[] = []
  if (named.length > 0) parts.push(`${named.length} ${named.length === 1 ? 'course' : 'courses'}`)
  if (loose) parts.push(`${loose.lessons} without one`)
  parts.push(`${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`)
  parts.push(`${entries} ${entries === 1 ? 'entry' : 'entries'} distilled`)

  return parts.join(' · ')
}
