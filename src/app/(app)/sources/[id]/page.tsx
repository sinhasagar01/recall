import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExtractPanel } from '@/components/sources/extract-panel'
import { SourceWorkspace } from '@/components/sources/source-workspace'
import { hasKey } from '@/lib/ai/extract'
import { readSource } from '@/lib/data/sources'
import { coverageSummary } from '@/lib/domain/extraction'
import { transcriptState } from '@/lib/domain/sources'

export default async function SourcePage({ params }: PageProps<'/sources/[id]'>) {
  const { id } = await params
  const found = await readSource(id)

  // Not-found and not-yours are the same answer, the rule the topic page follows.
  if (found === null) notFound()

  const extractable = hasKey() && transcriptState(found.source) === 'present'

  /*
    Which pass this would be. Coverage records it per entry, so a second reading
    of an extended transcript is legible as a second reading rather than merging
    invisibly into the first.
  */
  const covered = coverageSummary(found.source.coverage)
  const passes = covered.found === 0 ? 0 : Math.max(...found.source.coverage.map((e) => e.pass))

  return (
    <>
      <p className="mb-3.5 text-meta">
        <Link href="/sources" className="text-accent-ink underline hover:text-ink">
          ← Sources
        </Link>
      </p>
      {/*
        No key means NO BUTTON — not a disabled one, and not a prompt to add a
        key. DESIGN.md's quiz rule: the options stop being buttons rather than
        becoming disabled buttons, because a disabled button still says button.
        With no key the workspace below is arc 2 exactly as it shipped, and the
        manual path is the only path rather than the lesser one.

        A transcript is required too: there is nothing to send without one.
      */}
      {extractable ? (
        <div className="mb-6">
          <ExtractPanel
            sourceId={found.source.id}
            words={found.source.transcript_words ?? 0}
            pass={passes + 1}
          />
        </div>
      ) : null}

      <SourceWorkspace source={found.source} entries={found.entries} />
    </>
  )
}
