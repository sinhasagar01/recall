import Link from 'next/link'
import { formatDuration } from '@/lib/domain/duration'
import { sourceCrumbs, type SourceSummary } from '@/lib/domain/sources'

/**
 * "Where this came from" — one line, in its own register.
 *
 * It answers a question the product could never answer before: *where did I learn
 * this?* A topic with no source omits the section entirely, the rule Definition
 * and Visual already follow.
 *
 * ── Every level is a link, and that is the whole point ──────────────────────
 * Arc 2 showed a lesson name and a course as flat text with a `·` between them,
 * so "where did I learn this" was a fact you read rather than a place you could
 * go. Now the course opens the course group, the chapter opens the chapter, and
 * the lesson opens its workspace. *"I know exactly where it came from"* means a
 * route back, not a note.
 *
 * The levels come from `sourceCrumbs`, which drops the ones that are absent —
 * so a lesson with a course and no chapter renders two links, not a stray
 * separator around a gap.
 */
export function TopicSourceLine({
  source,
  siblings,
}: {
  source: SourceSummary
  siblings: number
}) {
  const crumbs = sourceCrumbs(source)
  const length = formatDuration(source.duration_seconds)

  /*
    Each level's destination. The last crumb is always the lesson, so it goes to
    the workspace; the others are course and chapter filters on the list.
  */
  const hrefFor = (index: number) => {
    if (index === crumbs.length - 1) return `/sources/${source.id}`
    if (index === 0 && source.course !== null) {
      return `/sources?course=${encodeURIComponent(source.course)}`
    }
    return `/sources?course=${encodeURIComponent(source.course ?? '')}&chapter=${encodeURIComponent(
      source.chapter ?? '',
    )}`
  }

  return (
    <section className="mb-[30px]">
      <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Where this came from
      </span>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule bg-surface-2 px-4 py-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Source</span>

        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="flex items-baseline gap-x-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-rule-strong">
                  ›
                </span>
              ) : null}
              <Link
                href={hrefFor(index)}
                data-testid="source-crumb"
                className={
                  index === crumbs.length - 1
                    ? 'text-option font-medium text-ink underline hover:text-accent-ink'
                    : 'text-option text-ink-2 underline hover:text-accent-ink'
                }
              >
                {crumb}
              </Link>
            </span>
          ))}
        </span>

        <span className="ml-auto flex items-baseline gap-x-3 font-mono text-[11px] text-ink-3">
          {length ? <span>{length}</span> : null}
          {siblings > 0 ? (
            <Link href={`/sources/${source.id}`} className="underline hover:text-ink">
              {siblings} other {siblings === 1 ? 'entry' : 'entries'} from this
            </Link>
          ) : null}
        </span>
      </div>
    </section>
  )
}
