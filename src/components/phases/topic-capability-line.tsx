import Link from 'next/link'
import type { Capability, Phase } from '@/lib/domain/phases'

/**
 * "What this is for" — one line, in the same register as "Where this came from".
 *
 * Two lines now, in the order a concept travels: where it came from, then what it
 * is for, then what you have done with it. A topic with no capability omits the
 * section, the rule Definition and Visual already follow.
 */
export function TopicCapabilityLine({
  capability,
  phase,
}: {
  capability: Capability
  phase: Phase
}) {
  return (
    <section className="mb-[30px]">
      <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        What this is for
      </span>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule bg-surface-2 px-4 py-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
          Capability
        </span>
        <Link
          href={`/phases/${phase.id}`}
          className="text-option font-medium text-ink underline hover:text-accent-ink"
        >
          {capability.name}
        </Link>
        <span className="ml-auto font-mono text-[11px] text-ink-3">{phase.name}</span>
      </div>
    </section>
  )
}
