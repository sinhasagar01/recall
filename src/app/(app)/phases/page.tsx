import Link from 'next/link'
import { AddPhaseButton } from '@/components/phases/add-phase-button'
import { StateBlock } from '@/components/ui/state-block'
import { demonstrationOfSummary } from '@/lib/domain/phases'
import { plural } from '@/lib/domain/plural'
import { BackToLibrary } from '@/components/ui/back-to-library'
import { Pagination } from '@/components/ui/pagination'
import { PageHeader } from '@/components/ui/page-header'
import { PHASE_PAGE_SIZE, listPhaseSummariesPage, readCurrentPhaseId } from '@/lib/data/phases'

/**
 * The phases you have started, in the order you started them.
 *
 * No percentage, no burn-down, no week counter. "2 of 4" is a count you can click
 * through to. Nothing here changes because a date passed.
 */
export default async function PhasesPage({ searchParams }: PageProps<'/phases'>) {
  const params = await searchParams
  const requested = Number(typeof params.page === 'string' ? params.page : '1')
  const [{ views, total, page }, current] = await Promise.all([
    listPhaseSummariesPage(Number.isSafeInteger(requested) && requested > 0 ? requested : 1),
    readCurrentPhaseId(),
  ])

  const withDemos = views.map((view) => ({
    ...view,
    demos: view.capabilities.map((c) => demonstrationOfSummary(c.entries)),
  }))

  const capabilities = withDemos.reduce((total, view) => total + view.demos.length, 0)
  const demonstrated = withDemos.reduce(
    (total, view) => total + view.demos.filter((d) => d.demonstrated).length,
    0,
  )

  /*
    The heading stays when the list is empty. Every route in the (app) group
    carries an h1 and wayfinding.spec.ts holds them to it — the arc 2 regression.
  */
  const header = (
    <PageHeader
      eyebrow="Learning plan"
      title="Phases"
      summary={
        views.length === 0
          ? 'Nothing started yet'
          : `${total > views.length ? 'This page · ' : ''}${plural(views.length, 'phase')} · ${plural(capabilities, 'capability', 'capabilities')} · ${demonstrated} demonstrated`
      }
      action={<AddPhaseButton label="+ Add a phase" />}
    />
  )

  if (views.length === 0) {
    return (
      <>
        {header}
        <StateBlock
          eyebrow="Phases"
          title="Nothing here yet"
          body="Add the phase you are in now. A phase is a stretch of weeks and the handful of things you will be able to do at the end of it."
          action={<AddPhaseButton label="+ Add a phase" />}
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

      <div className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
        {withDemos.map((view) => {
          const done = view.demos.filter((d) => d.demonstrated).length
          const isCurrent = view.phase.id === current

          return (
            <Link
              key={view.phase.id}
              href={`/phases/${view.phase.id}`}
              className={`flex items-center gap-4 border-b border-rule px-5 py-5 last:border-b-0 hover:bg-surface-2 ${
                isCurrent ? 'bg-accent-soft/45' : ''
              }`}
            >
              {/* One square per capability, filled when demonstrated. */}
              <span className="flex flex-none items-center gap-[3px]" aria-hidden="true">
                {view.demos.map((demo, index) => (
                  <i
                    key={index}
                    className={`size-[7px] rounded-[2px] border ${
                      demo.demonstrated ? 'border-ok bg-ok' : 'border-rule-strong'
                    }`}
                  />
                ))}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-display text-[18px] leading-[1.25] font-medium">
                  {view.phase.name}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                  {[view.phase.when_text, view.phase.sources_text].filter(Boolean).join(' · ') ||
                    'No dates, by design'}
                </span>
              </span>

              {isCurrent ? (
                <span className="flex-none rounded-[3px] border border-accent bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] text-accent-ink uppercase">
                  Current
                </span>
              ) : null}

              <span
                className={`flex-none font-mono text-[11.5px] whitespace-nowrap ${
                  done > 0 ? 'text-ink-2' : 'text-ink-3'
                }`}
              >
                {done > 0 ? <b className="font-medium text-ok">{done}</b> : '0'} of{' '}
                {view.demos.length}
              </span>
            </Link>
          )
        })}
      </div>

      <Pagination href="/phases" page={page} pageSize={PHASE_PAGE_SIZE} total={total} />

      <div className="mt-9 border-t border-rule pt-5">
        <BackToLibrary />
      </div>
    </>
  )
}
