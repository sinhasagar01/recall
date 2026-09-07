import Link from 'next/link'
import { AddPhaseButton } from '@/components/phases/add-phase-button'
import { StateBlock } from '@/components/ui/state-block'
import { listPhases } from '@/lib/data/phases'
import { currentPhaseId, demonstrationOf } from '@/lib/domain/phases'
import { plural } from '@/lib/domain/plural'

/**
 * The phases you have started, in the order you started them.
 *
 * No percentage, no burn-down, no week counter. "2 of 4" is a count you can click
 * through to. Nothing here changes because a date passed.
 */
export default async function PhasesPage() {
  const views = await listPhases()

  const withDemos = views.map((view) => ({
    ...view,
    demos: view.capabilities.map((c) => demonstrationOf(c.entries)),
  }))

  const current = currentPhaseId(
    withDemos.map((view) => ({ id: view.phase.id, capabilities: view.demos })),
  )

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
    <div className="mb-[22px] flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Phases</h1>
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
          {views.length === 0
            ? 'Nothing started yet'
            : `${plural(views.length, 'phase')} · ${plural(capabilities, 'capability', 'capabilities')} · ${demonstrated} demonstrated`}
        </p>
      </div>
      <AddPhaseButton label="+ Add a phase" />
    </div>
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

      <div className="flex flex-col gap-2.5">
        {withDemos.map((view) => {
          const done = view.demos.filter((d) => d.demonstrated).length
          const isCurrent = view.phase.id === current

          return (
            <Link
              key={view.phase.id}
              href={`/phases/${view.phase.id}`}
              className={`flex items-center gap-4 rounded-lg border bg-surface px-[18px] py-4 shadow-[0_1px_2px_rgba(18,19,26,.05)] hover:border-rule-strong ${
                isCurrent ? 'border-l-[3px] border-accent' : 'border-rule'
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

      <p className="mt-9 border-t border-rule pt-5 text-meta text-ink-2">
        <Link href="/library" className="underline hover:text-ink">
          Back to the library
        </Link>
      </p>
    </>
  )
}
