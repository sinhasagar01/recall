'use client'

import { useState } from 'react'
import { EvidenceRow } from '@/components/evidence/evidence-row'
import { EvidenceDialog } from '@/components/evidence/evidence-dialog'
import { evidenceFor, localDateString, type EvidenceKind } from '@/lib/domain/evidence'
import type { TopicRecord } from '@/lib/domain/types'

/**
 * The row plus the dialog it opens. Client-side only because the dialog has state.
 *
 * `today` arrives as a prop from the browser's own clock, computed once on open
 * rather than read inside the dialog — see `localDateString`.
 *
 * The mobile button opens the dialog with `askKind`, so the kind is chosen in the
 * dialog rather than by which cell was tapped.
 */
export function EvidenceSection({ topic }: { topic: TopicRecord }) {
  const [open, setOpen] = useState<{ kind: EvidenceKind; askKind: boolean } | null>(null)

  return (
    <>
      <EvidenceRow
        topic={topic}
        onRecord={(kind) => setOpen({ kind, askKind: window.innerWidth < 860 })}
      />

      {open ? (
        <EvidenceDialog
          topicId={topic.id}
          kind={open.kind}
          askKind={open.askKind}
          existing={evidenceFor(topic, open.kind)}
          today={localDateString(new Date())}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}
