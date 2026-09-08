import Link from 'next/link'
import { SourceRow } from '@/components/sources/source-row'
import { formatDuration } from '@/lib/domain/duration'
import { NO_CHAPTER, NO_COURSE, type CourseNode } from '@/lib/domain/source-grouping'
import { minedCopy } from '@/lib/domain/sources'
import { plural } from '@/lib/domain/plural'

/**
 * One course: a panel, its chapters, and their lessons.
 *
 * ── A card, like every other list in this app ───────────────────────────────
 * Border, radius, surface, shadow — the treatment the library cards, the
 * practice line and the review screen already use. The first build of this
 * screen drew flat text with a hairline under each course head, which gives two
 * courses nothing to separate them: the eye reads one long list with headings in
 * it rather than two things.
 *
 * ── The chapter band is a tinted strip in sentence case ─────────────────────
 * Not uppercase mono. Uppercase mono is this project's EYEBROW treatment — it
 * says "the name of a section of a page", and a chapter is not that, it is a
 * level of the hierarchy the panel is showing. `--surface-2` behind it separates
 * the band from the lessons under it without another rule.
 *
 * ── Both practise actions sit AFTER the content they cover ──────────────────
 * "Practise this course" used to sit directly under the course head, above the
 * first chapter — competing with the hierarchy it contains, and reading as
 * though it belonged to the chapter below it. Each action now follows what it
 * acts on: the chapter's at the foot of its lessons, the course's in the panel
 * footer.
 *
 * ── Two counts, and no bar ──────────────────────────────────────────────────
 * *"3 of 5 mined"* is lessons that produced something — `minedCopy`, from
 * `isMined`. It is deliberately NOT the same word as the page's *"finished"*
 * count, which is about confidence; the two used to read "mined" and "mined
 * out" and were three characters apart. See DESIGN.md.
 *
 * There is no progress bar: a bar needs a denominator, and the app knows how
 * many lessons you ADDED, never how many the course has.
 */
export function CourseGroup({ node, now }: { node: CourseNode; now: Date }) {
  const length = formatDuration(node.seconds)
  const named = node.course !== null

  return (
    <section
      data-testid="course-group"
      data-course={node.course ?? ''}
      className="mb-3 overflow-hidden rounded-lg border border-rule bg-surface shadow-[0_1px_2px_rgba(18,19,26,.05),0_1px_1px_rgba(18,19,26,.03)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-[18px] py-[15px]">
        <h2
          className={`font-display text-[19px] leading-[1.25] font-medium ${
            named ? 'text-ink' : 'text-ink-3'
          }`}
        >
          {node.course ?? NO_COURSE}
        </h2>

        <p className="font-mono text-[11px] text-ink-3">
          {named && node.chapters.length > 1 ? `${plural(node.chapters.length, 'chapter')} · ` : ''}
          {plural(node.lessons, 'lesson')}
          {length ? ` · ${length}` : ''} · {plural(node.entries, 'entry', 'entries')} ·{' '}
          <span data-testid="course-mined">{minedCopy(node.mined, node.lessons)}</span>
        </p>
      </div>

      {node.chapters.map((chapter) => (
        <div
          key={chapter.chapter ?? '—'}
          data-testid="chapter-group"
          className="border-b border-rule last:border-b-0"
        >
          {/*
            A course whose only chapter is the unnamed one has no band to show —
            a strip reading "No chapter" above every lesson of a course nobody
            gave chapters to is noise about an absence.
          */}
          {chapter.chapter !== null || node.chapters.length > 1 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-surface-2 px-[18px] py-[11px]">
              <span
                className={`text-[13.5px] font-medium ${
                  chapter.chapter === null ? 'text-ink-3' : 'text-ink'
                }`}
              >
                {chapter.chapter ?? NO_CHAPTER}
              </span>
              <span className="font-mono text-[10.5px] text-ink-3">
                {plural(chapter.lessons.length, 'lesson')}
                {formatDuration(chapter.seconds) ? ` · ${formatDuration(chapter.seconds)}` : ''} ·{' '}
                {plural(chapter.entries, 'entry', 'entries')}
              </span>
            </div>
          ) : null}

          {chapter.lessons.map(({ view }) => (
            <SourceRow key={view.source.id} view={view} now={now} />
          ))}

          {named && chapter.chapter !== null && chapter.entries > 0 ? (
            <p className="border-t border-rule px-[18px] py-2.5 pl-[34px]">
              <Link
                href={`/practice?scope=chapter&course=${encodeURIComponent(
                  node.course!,
                )}&chapter=${encodeURIComponent(chapter.chapter)}`}
                className="font-mono text-[11px] text-accent-ink underline hover:text-ink"
              >
                Practise this chapter · {plural(chapter.entries, 'entry', 'entries')}
              </Link>
            </p>
          ) : null}
        </div>
      ))}

      {named && node.entries > 0 ? (
        <p className="border-t border-rule bg-surface-2 px-[18px] py-3">
          <Link
            href={`/practice?scope=course&course=${encodeURIComponent(node.course!)}`}
            className="font-mono text-[11.5px] text-accent-ink underline hover:text-ink"
          >
            Practise this course · {plural(node.entries, 'entry', 'entries')}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
