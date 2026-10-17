import { AddSourceButton } from '@/components/sources/add-source-button'
import { CourseGroup } from '@/components/sources/course-group'
import { StateBlock } from '@/components/ui/state-block'
import { groupSources, groupedHeadline } from '@/lib/domain/source-grouping'
import { finishedCopy, finishedCount } from '@/lib/domain/sources'
import { BackToLibrary } from '@/components/ui/back-to-library'
import { Pagination } from '@/components/ui/pagination'
import { PageHeader } from '@/components/ui/page-header'
import { SOURCE_PAGE_SIZE, listSourceFormSiblings, listSourcesPage } from '@/lib/data/sources'

/**
 * The one number this screen exists to show.
 *
 * Not how many videos you saved — how many turned into something you can recall.
 */
export default async function SourcesPage({ searchParams }: PageProps<'/sources'>) {
  const params = await searchParams
  const requested = Number(typeof params.page === 'string' ? params.page : '1')
  const [{ views, total, page }, sourceChoices] = await Promise.all([
    listSourcesPage(Number.isSafeInteger(requested) && requested > 0 ? requested : 1),
    listSourceFormSiblings(),
  ])
  const now = new Date()

  /*
  Grouped from this bounded page. `groupSources` is pure and cannot reach a
  client, so pagination does not create a per-row request pattern.
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
    <PageHeader
      eyebrow="Reference material"
      title="Sources"
      summary={
        views.length === 0 ? 'Nothing saved yet' : (
          <>
              {/*
                `groupedHeadline` counts courses WITHOUT counting the absence of
                one as a course — the mock's header read "2 courses" when one of
                the two was "No course".
              */}
              {groupedHeadline(courses)}
              {empty > 0 ? ` · ${empty} with nothing` : ''}
          </>
        )
      }
      action={<AddSourceButton label="+ Add a source" siblings={sourceChoices} />}
    />
  )

  if (views.length === 0) {
    return (
      <>
        {header}
        <StateBlock
          eyebrow="Sources"
          title="Nothing here yet"
          body="Add the video you are watching. Its transcript is scratch you work from — what you distil out of it is the library."
          action={<AddSourceButton label="+ Add a source" siblings={sourceChoices} />}
        />
        <div className="mt-9 border-t border-rule pt-5">
          <BackToLibrary />
        </div>
      </>
    )
  }

  return (
    <>
      {header}

      {courses.map((node) => (
        <CourseGroup key={node.course ?? '—'} node={node} now={now} />
      ))}

      <Pagination href="/sources" page={page} pageSize={SOURCE_PAGE_SIZE} total={total} />

      {/*
        FINISHED, not "mined out" — every entry okay or better, which is about
        confidence. The course panels above count what is MINED, which is about
        extraction. Both derive from named functions in the domain rather than
        from two inline expressions that happened to look alike.
      */}
      <p className="mt-6 font-mono text-[11.5px] text-ink-3">
        {total > views.length ? 'On this page: ' : ''}
        {finishedCopy(finishedCount(views), views.length)}
      </p>

      <div className="mt-9 border-t border-rule pt-5">
        <BackToLibrary />
      </div>
    </>
  )
}
