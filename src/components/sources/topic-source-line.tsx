import Link from 'next/link'
import type { SourceSummary } from '@/lib/domain/sources'

/**
 * "Where this came from" — one line, in its own register.
 *
 * It answers a question the product could never answer before: *where did I learn
 * this?* A topic with no source omits the section entirely, the rule Definition
 * and Visual already follow.
 */
export function TopicSourceLine({
  source,
  siblings,
}: {
  source: SourceSummary
  siblings: number
}) {
  return (
    <section className="mb-[30px]">
      <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Where this came from
      </span>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule bg-surface-2 px-4 py-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">Source</span>
        <Link href={`/sources/${source.id}`} className="text-option font-medium text-ink underline hover:text-accent-ink">
          {source.title}
        </Link>
        {source.course ? <span className="text-meta text-ink-2">· {source.course}</span> : null}
        {siblings > 0 ? (
          <Link
            href={`/sources/${source.id}`}
            className="ml-auto font-mono text-[11px] text-ink-3 underline hover:text-ink"
          >
            {siblings} other {siblings === 1 ? 'entry' : 'entries'} from this
          </Link>
        ) : null}
      </div>
    </section>
  )
}
