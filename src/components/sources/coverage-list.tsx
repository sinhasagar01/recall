import Link from 'next/link'
import { coverageSummary, type CoverageEntry } from '@/lib/domain/extraction'
import { plural } from '@/lib/domain/plural'

/**
 * The "never rewatch it" screen.
 *
 * Every concept the video covered and what happened to each, so nothing was
 * silently skipped. It is the one thing this arc persists beyond ordinary topics
 * and it costs one column, because it is the record of a DECISION rather than a
 * model response.
 *
 * ── The tick is green, and that is the rule rather than an exception ────────
 * `--ok` marks what the app DERIVES and what is BINARY. Kept is both: a topic
 * exists for that concept or it does not, and the app can see which. It also
 * replaces `bg-ok` dots on the same screen — arc 2's five-item checklist — so
 * this is the same colour making the same kind of claim, not a new green.
 *
 * ── "Add anyway" does not restore a concept ─────────────────────────────────
 * The reference drew this button and promised the concept could be *"added later
 * without re-extracting"*. It cannot: coverage stores a title, a timestamp, a
 * status and a reason, because the same reference's rules tab says model prose
 * is never persisted. Both cannot be true.
 *
 * Resolved in favour of the rule, so the button opens the manual add sheet with
 * the TITLE prefilled and says exactly that. A drawing that implies stored data
 * is the failure shape this project has hit most often; this is the first time
 * it appeared as a reference contradicting itself rather than contradicting a
 * shipped rule.
 */
export function CoverageList({
  sourceId,
  coverage,
}: {
  sourceId: string
  coverage: CoverageEntry[]
}) {
  if (coverage.length === 0) return null

  const summary = coverageSummary(coverage)

  return (
    <section className="mb-7">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          What the video covered
        </span>
        <span className="font-mono text-[11.5px] text-ink-3">
          {plural(summary.found, 'concept')} found · {summary.kept} saved · {summary.dropped}{' '}
          dropped
          {summary.partial ? ' · one pass was partial' : ''}
        </span>
      </div>

      <ul className="list-none rounded-lg border border-rule bg-surface px-[15px]">
        {coverage.map((entry, index) => (
          <li
            key={`${entry.normalised}-${index}`}
            data-testid="coverage-row"
            data-status={entry.status}
            className="flex items-start gap-3 border-b border-rule py-3 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className={`w-4 flex-none pt-[3px] font-mono text-[11px] ${
                entry.status === 'kept' ? 'text-ok' : 'text-ink-3'
              }`}
            >
              {entry.status === 'kept' ? '✓' : '—'}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-body ${entry.status === 'dropped' ? 'text-ink-3' : 'text-ink'}`}
              >
                {entry.title}
              </p>
              <p className="mt-[3px] font-mono text-[10px] text-ink-3">
                {entry.timestamp !== null ? `${entry.timestamp} · ` : ''}
                {entry.status === 'kept'
                  ? `saved${entry.pass > 1 ? ` · pass ${entry.pass}` : ''}`
                  : `dropped — ${entry.reason ?? 'you dropped it'}`}
              </p>
            </div>

            {entry.status === 'dropped' ? (
              <Link
                href={`/library?add=1&source=${sourceId}&title=${encodeURIComponent(entry.title)}`}
                className="flex-none rounded-md px-2 py-1 font-mono text-[11px] text-accent-ink underline hover:text-ink"
              >
                Add by hand
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-2 font-mono text-[11px] text-ink-3">
        A dropped concept keeps only its title — the definition and questions were never stored,
        so adding one back is the manual path or another extraction.
      </p>
    </section>
  )
}
