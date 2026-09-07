import Link from 'next/link'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { SourceRow } from '@/components/sources/source-row'
import { StateBlock } from '@/components/ui/state-block'
import { listSources } from '@/lib/data/sources'
import { extractionCount } from '@/lib/domain/sources'

/**
 * The one number this screen exists to show.
 *
 * Not how many videos you saved — how many turned into something you can recall.
 */
export default async function SourcesPage() {
  const views = await listSources()
  const now = new Date()

  const distilled = views.reduce((total, view) => total + view.entries.length, 0)
  const empty = views.filter((view) => view.entries.length === 0).length

  if (views.length === 0) {
    return (
      <StateBlock
        eyebrow="Sources"
        title="Nothing here yet"
        body="Add the video you are watching. Its transcript is scratch you work from — what you distil out of it is the library."
        action={<AddSourceButton label="+ Add a source" />}
      />
    )
  }

  return (
    <>
      <div className="mb-[26px] flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Sources</h1>
          <p className="mt-1.5 text-meta text-ink-2">
            {views.length} {views.length === 1 ? 'source' : 'sources'} · {distilled}{' '}
            {distilled === 1 ? 'entry' : 'entries'} distilled
            {empty > 0 ? ` · ${empty} with nothing` : ''}
          </p>
        </div>
        <AddSourceButton label="+ Add a source" />
      </div>

      <div className="border-t border-rule">
        {views.map((view) => (
          <SourceRow key={view.source.id} view={view} now={now} />
        ))}
      </div>

      {/* Extractions, not videos watched. */}
      <p className="mt-6 font-mono text-[11.5px] text-ink-3">
        {views.filter((view) => extractionCount(view.source, view.entries) === 5).length} of{' '}
        {views.length} fully extracted
      </p>

      <p className="mt-9 border-t border-rule pt-5 text-meta text-ink-2">
        <Link href="/library" className="underline hover:text-ink">
          Back to the library
        </Link>
      </p>
    </>
  )
}
