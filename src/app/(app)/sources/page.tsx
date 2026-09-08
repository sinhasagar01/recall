import Link from 'next/link'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { CourseGroup } from '@/components/sources/course-group'
import { StateBlock } from '@/components/ui/state-block'
import { listSources } from '@/lib/data/sources'
import { groupSources, groupedHeadline } from '@/lib/domain/source-grouping'
import { finishedCopy, finishedCount } from '@/lib/domain/sources'

/**
 * The one number this screen exists to show.
 *
 * Not how many videos you saved — how many turned into something you can recall.
 */
export default async function SourcesPage() {
  const views = await listSources()
  const now = new Date()

  /*
    Grouped in the domain, from the two reads listSources already does. There is
    no N+1 to avoid: `groupSources` is pure and cannot reach a client.
  */
  const courses = groupSources(views)
  const empty = views.filter((view) => view.entries.length === 0).length

  /*
    The heading stays when the list is empty.

    Every route in the (app) group carries an h1, and e2e/wayfinding.spec.ts holds
    them to it — an empty screen that drops its title leaves you on a page that
    does not say where you are. The weak page settled this shape first: keep the
    header, vary the subtitle, put the invitation below it.
  */
  const header = (
    <div className="mb-[26px] flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Sources</h1>
        <p className="mt-1.5 text-meta text-ink-2">
          {views.length === 0 ? (
            'Nothing saved yet'
          ) : (
            <>
              {/*
                `groupedHeadline` counts courses WITHOUT counting the absence of
                one as a course — the mock's header read "2 courses" when one of
                the two was "No course".
              */}
              {groupedHeadline(courses)}
              {empty > 0 ? ` · ${empty} with nothing` : ''}
            </>
          )}
        </p>
      </div>
      <AddSourceButton label="+ Add a source" siblings={views.map((view) => view.source)} />
    </div>
  )

  if (views.length === 0) {
    return (
      <>
        {header}
        <StateBlock
          eyebrow="Sources"
          title="Nothing here yet"
          body="Add the video you are watching. Its transcript is scratch you work from — what you distil out of it is the library."
          action={<AddSourceButton label="+ Add a source" siblings={views.map((view) => view.source)} />}
        />
        <p className="mt-9 border-t border-rule pt-5 text-meta text-ink-2">
          <Link href="/library" className="underline hover:text-ink">
            Back to the library
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      {header}

      {courses.map((node) => (
        <CourseGroup key={node.course ?? '—'} node={node} now={now} />
      ))}

      {/*
        FINISHED, not "mined out" — every entry okay or better, which is about
        confidence. The course panels above count what is MINED, which is about
        extraction. Both derive from named functions in the domain rather than
        from two inline expressions that happened to look alike.
      */}
      <p className="mt-6 font-mono text-[11.5px] text-ink-3">
        {finishedCopy(finishedCount(views), views.length)}
      </p>

      <p className="mt-9 border-t border-rule pt-5 text-meta text-ink-2">
        <Link href="/library" className="underline hover:text-ink">
          Back to the library
        </Link>
      </p>
    </>
  )
}
