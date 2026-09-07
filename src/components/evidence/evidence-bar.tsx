import { EVIDENCE_KINDS, evidenceFor } from '@/lib/domain/evidence'
import type { Topic } from '@/lib/domain/types'

/**
 * Three squares on a library card. Never four.
 *
 * The confidence meter beside it already carries Recall, so a fourth square would
 * say the same thing twice. A topic with none of the three renders nothing at all
 * rather than three empty squares — an empty row on every card would be noise on
 * a library where most topics will never carry evidence, which is why the caller
 * checks `hasEvidence` before drawing this.
 *
 * Colour is not the only signal: the accessible name says which markers are
 * recorded in words.
 */
export function EvidenceBar({ topic }: { topic: Topic }) {
  const recorded = EVIDENCE_KINDS.filter((kind) => evidenceFor(topic, kind) !== null)

  return (
    <span
      className="inline-flex shrink-0 items-center gap-[3px]"
      role="img"
      aria-label={`Evidence: ${recorded.join(', ')}`}
    >
      {EVIDENCE_KINDS.map((kind) => (
        <i
          key={kind}
          className={`size-[7px] rounded-[2px] border ${
            recorded.includes(kind) ? 'border-ok bg-ok' : 'border-rule-strong'
          }`}
        />
      ))}
    </span>
  )
}
