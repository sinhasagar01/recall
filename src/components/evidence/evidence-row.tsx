'use client'

import { Button } from '@/components/ui/button'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { CONFIDENCE_LABEL, isNeverPracticed } from '@/lib/domain/confidence'
import { formatShortDate } from '@/lib/domain/library'
import {
  EVIDENCE_COPY,
  EVIDENCE_KINDS,
  EVIDENCE_RULE,
  evidenceFor,
  type EvidenceKind,
} from '@/lib/domain/evidence'
import type { TopicRecord } from '@/lib/domain/types'

/**
 * Four cells, three of them recordable.
 *
 * ── Why Recall appears here at all ──────────────────────────────────────────
 * It restates the confidence the meter already shows, and the Recall history
 * section below still shows it too. That repetition is the point: the row is a
 * claim about one rule — *explain it, implement a variant, use it in a design
 * decision* — and a rule with a hole in it reads as three unrelated checkboxes.
 *
 * The Recall cell is **derived**. Never stored, never editable, never a second
 * source of truth for confidence.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 * Every cell carries a tick or a dashed circle, a label and text, so done and
 * not-yet read differently in greyscale.
 */
export function EvidenceRow({
  topic,
  onRecord,
}: {
  topic: TopicRecord
  onRecord: (kind: EvidenceKind) => void
}) {
  const practised =
    topic.practice_count > 0
      ? `practiced ${topic.practice_count}× · last ${formatShortDate(topic.last_practiced_at)}`
      : '—'

  return (
    <section className="mb-[30px]">
      <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Evidence
      </span>

      {/* The rule, in the product, so the row is never four ticks without a reason. */}
      <p className="mt-[7px] mb-[11px] max-w-[66ch] text-[12.5px] leading-[1.6] text-ink-2">
        {EVIDENCE_RULE}
      </p>

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-rule bg-surface md:grid-cols-4">
        {/*
          `isNeverPracticed` is the project's one definition, and it keys on
          confidence rather than on a timestamp because editing a topic can set
          confidence directly — the two can disagree. Inlining `!== 'new'` here
          would be a second copy of that rule.
        */}
        <Cell
          tone="recall"
          done={!isNeverPracticed(topic)}
          label="Recall"
          value={
            isNeverPracticed(topic) ? (
              <span className="font-normal text-ink-3">Never practiced</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <ConfidenceMeter confidence={topic.confidence} />
                {CONFIDENCE_LABEL[topic.confidence]}
              </span>
            )
          }
          detail={practised}
        />

        {EVIDENCE_KINDS.map((kind) => {
          const entry = evidenceFor(topic, kind)
          const { label, hint } = EVIDENCE_COPY[kind]

          return (
            <Cell
              key={kind}
              testId={`evidence-detail-${kind}`}
              tone={entry === null ? 'todo' : 'done'}
              done={entry !== null}
              label={label}
              value={entry === null ? 'Not yet' : entry.note}
              detail={
                entry === null ? (
                  hint
                ) : (
                  <>
                    {formatShortDate(entry.at)}
                    {entry.url ? (
                      <>
                        {' · '}
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline hover:text-ink"
                        >
                          link
                        </a>
                      </>
                    ) : null}
                  </>
                )
              }
              action={
                /*
                  Revealed on hover, and on FOCUS-WITHIN — never `hidden` or
                  `display:none`, either of which would take it out of the tab
                  order and leave the row unusable without a pointer. Asserted in
                  evidence-row.test.tsx by tabbing to it with no pointer event.

                  And no `pointer-events: none` either: it made the button
                  unclickable until a hover had already resolved, which Playwright
                  hit as a 30-second timeout on a button it could plainly see. The
                  reference uses opacity alone, and opacity alone is right — the
                  cell is the hover target, so the button is visible before anyone
                  could reach it with a pointer.
                */
                <span className="block opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {/*
                    An explicit aria-label, not visible text plus an sr-only span.
                    Accessible-name computation concatenates text nodes WITHOUT
                    inserting separators, so "Record" + a span reading " rebuild"
                    announced as "Recordrebuild" — caught by the component test,
                    invisible on screen.
                  */}
                  <Button
                    variant={entry === null ? 'secondary' : 'ghost'}
                    onClick={() => onRecord(kind)}
                    aria-label={`${entry === null ? 'Record' : 'Edit'} ${label.toLowerCase()}`}
                    className="px-2.5 py-1 text-[11.5px]"
                  >
                    {entry === null ? 'Record' : 'Edit'}
                  </Button>
                </span>
              }
            />
          )
        })}
      </div>

      {/*
        Below the breakpoint the per-cell buttons are unreachable by touch, so one
        button asks which kind first. Three hover-revealed controls do not survive
        a touch screen, and four tap targets across 390pt would each be under 44px.
      */}
      <div className="mt-3 md:hidden">
        <Button block onClick={() => onRecord('rebuild')}>
          Record evidence
        </Button>
      </div>
    </section>
  )
}

function Cell({
  tone,
  done,
  label,
  value,
  detail,
  action,
  testId,
}: {
  tone: 'recall' | 'done' | 'todo'
  done: boolean
  label: string
  value: React.ReactNode
  detail: React.ReactNode
  action?: React.ReactNode
  testId?: string
}) {
  return (
    <div
      /*
        The button sits in normal flow, not absolutely positioned.

        Absolute positioning meant it never shifted the layout and always sat ON
        the date line once a note wrapped to two lines — the common case for a real
        note. Reserving a fixed bottom padding would have been a guess at the
        button's height, and the first guess was wrong: the size override loses to
        Tailwind's class ordering, so the button is 42px rather than the 27px it
        looks like.

        In flow with `mt-auto` it occupies its own space at the bottom of the cell
        whether or not it is visible, so nothing moves when it appears and nothing
        can overlap at any note length. Structural rather than numeric.
      */
      className={`group flex flex-col border-r border-b border-rule px-[14px] pt-[13px] pb-[13px] last:border-r-0 md:border-b-0 ${
        tone === 'recall' ? 'bg-surface-2' : tone === 'done' ? 'bg-ok-soft' : ''
      }`}
    >
      <div
        className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase ${
          tone === 'done' ? 'text-ok' : 'text-ink-3'
        }`}
      >
        <span
          aria-hidden="true"
          className={`grid size-[15px] place-items-center rounded-full border text-[9px] text-white ${
            done
              ? tone === 'recall'
                ? 'border-ink bg-ink'
                : 'border-ok bg-ok'
              : 'border-dashed border-rule-strong'
          }`}
        >
          {done ? '✓' : ''}
        </span>
        {label}
      </div>

      <div
        className={`mt-[7px] text-[13.5px] leading-[1.45] font-medium ${
          tone === 'done' ? 'text-ok' : tone === 'todo' ? 'font-normal text-ink-3' : 'text-ink'
        }`}
      >
        {value}
      </div>

      <div data-testid={testId} className="mt-[5px] font-mono text-[11px] text-ink-3">
        {detail}
      </div>
      {/* mt-auto pins it to the bottom while still taking part in the layout. */}
      {action ? <div className="mt-auto pt-2.5">{action}</div> : null}
    </div>
  )
}
