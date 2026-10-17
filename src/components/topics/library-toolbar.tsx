'use client'

import { SEARCH_INPUT_ID } from '@/components/topics/global-keys'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { QuickFilterChip } from '@/components/ui/chip'
import { Kbd } from '@/components/ui/kbd'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import type { CategoryOption } from '@/lib/domain/library'
import type { QuickFilter } from '@/lib/domain/search-filter'
import type { Kind } from '@/lib/domain/types'

export interface ToolbarState {
  query: string
  category: string
  confidence: string
  difficulty: string
  /** "all" is the sentinel for both shapes, matching the other selects. */
  kind: string
  quickFilters: QuickFilter[]
}

/*
  Wiring only. Every option list and every count arrives as a prop, already
  computed by a domain function — there is no comparison in this file.
*/
export function LibraryToolbar({
  state,
  onChange,
  onClear,
  categories,
  confidences,
  difficulties,
  quickCounts,
  kindCounts,
  actions,
}: {
  state: ToolbarState
  onChange: (next: Partial<ToolbarState>) => void
  onClear: () => void
  categories: CategoryOption[]
  confidences: CategoryOption[]
  difficulties: CategoryOption[]
  quickCounts: Record<QuickFilter, number>
  /** All is `total`, so it is not carried separately. */
  kindCounts: { total: number } & Record<Kind, number>
  /** Bulk actions belong to the same working surface as filters, not a separate banner. */
  actions: ReactNode
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  const toggleQuick = (quick: QuickFilter) =>
    onChange({
      quickFilters: state.quickFilters.includes(quick)
        ? state.quickFilters.filter((existing) => existing !== quick)
        : [...state.quickFilters, quick],
    })

  const isFiltered =
    state.query !== '' ||
    state.category !== 'all' ||
    state.confidence !== 'any' ||
    state.difficulty !== 'any' ||
    state.kind !== 'all' ||
    state.quickFilters.length > 0

  return (
    <>
      <section className="mb-6 overflow-visible rounded-lg border border-rule bg-surface shadow-card" aria-label="Library controls">
        <div className="flex flex-wrap items-center gap-2.5 p-3">
          <div className="relative min-w-[240px] flex-1">
            <span className="pointer-events-none absolute top-1/2 left-[11px] flex -translate-y-1/2 text-ink-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              /* Targeted by the `/` shortcut; see components/topics/global-keys.tsx. */
              id={SEARCH_INPUT_ID}
              type="search"
              aria-label="Search your knowledge"
              placeholder="Search your knowledge…"
              value={state.query}
              onChange={(event) => onChange({ query: event.target.value })}
              className="w-full rounded-md border border-rule-strong bg-surface py-2.5 pr-10 pl-[34px] text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"><Kbd>/</Kbd></span>
          </div>

          {/* On a phone the same selects move into the Filters sheet below. */}
          <div className="hidden flex-wrap gap-1.5 md:flex">
            <Selects state={state} onChange={onChange} categories={categories} confidences={confidences} difficulties={difficulties} />
            {isFiltered ? <Button variant="ghost" onClick={onClear} className="font-mono text-[11.5px]">Clear</Button> : null}
          </div>
        </div>

        {/* Scope, quick filters and careful bulk actions share one composed lower rail. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule bg-surface-2/60 px-3 py-2.5">
          <span className="font-mono text-mono-xs tracking-[0.12em] text-ink-3 uppercase">Show</span>
          <div className="flex flex-wrap gap-1.5">
        {/*
          The type chips lead the row, and unlike the quick filters they are
          mutually exclusive — All is the absence of the filter, not a third value.
          Grouped so a screen reader reads them as one control rather than three
          unrelated toggles that happen to sit together.

          Counts come from `byKind`, produced by `libraryCounts` in local mode and
          by `library_counts` in SQL past the threshold — the same pair the parity
          harness holds to agreement. A chip cannot claim a number that clicking it
          would not yield.
        */}
        <span role="group" aria-label="Type" className="flex gap-1.5">
          {(
            [
              ['all', 'All', kindCounts.total],
              ['topic', 'Topics', kindCounts.topic],
              ['quiz', 'Quizzes', kindCounts.quiz],
            ] as const
          ).map(([value, label, count]) => (
            <QuickFilterChip
              key={value}
              pressed={state.kind === value}
              onClick={() => onChange({ kind: value })}
            >
              {label} {count}
            </QuickFilterChip>
          ))}
        </span>

        {/* Weak is a chip here, not a destination — DESIGN.md, "Mobile has two destinations plus add". */}
        <span className="md:hidden">
          <QuickFilterChip
            pressed={state.quickFilters.includes('needs-review')}
            onClick={() => toggleQuick('needs-review')}
          >
            Weak {quickCounts['needs-review']}
          </QuickFilterChip>
        </span>

        {(
          [
            ['never-practiced', 'Never practiced'],
            ['recently-added', 'Recently added'],
            ['recently-practiced', 'Recently practiced'],
            /*
              Arc 6. "Which of these did I actually think about" — the one
              surface where `extracted` is visible, and the whole reason the
              column exists. Desktop only, like the two above it: the mobile chip
              row is already at its width.
            */
            ['extracted', 'Extracted'],
            ['written', 'Written by hand'],
          ] as const
        ).map(([value, label]) => (
          <span key={value} className={value === 'never-practiced' ? '' : 'hidden md:inline'}>
            <QuickFilterChip
              pressed={state.quickFilters.includes(value)}
              onClick={() => toggleQuick(value)}
            >
              {label} {quickCounts[value]}
            </QuickFilterChip>
          </span>
        ))}

        <span className="md:hidden">
          <QuickFilterChip pressed={filtersOpen} onClick={() => setFiltersOpen(true)}>
            Filters
          </QuickFilterChip>
        </span>

        {isFiltered ? (
          <span className="md:hidden">
            <QuickFilterChip pressed={false} onClick={onClear}>
              Clear
            </QuickFilterChip>
          </span>
        ) : null}
          </div>
          <div className="ml-auto flex min-h-8 items-center">{actions}</div>
        </div>
      </section>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="flex flex-col gap-4">
          <Selects
            state={state}
            onChange={onChange}
            categories={categories}
            confidences={confidences}
            difficulties={difficulties}
          />
        </div>
      </Sheet>
    </>
  )
}

/** The same three Selects, drawn in the toolbar on desktop and in a sheet on mobile. */
function Selects({
  state,
  onChange,
  categories,
  confidences,
  difficulties,
}: {
  state: ToolbarState
  onChange: (next: Partial<ToolbarState>) => void
  categories: CategoryOption[]
  confidences: CategoryOption[]
  difficulties: CategoryOption[]
}) {
  return (
    <>
      <Select
        label="Category"
        options={categories}
        value={state.category}
        unsetValue="all"
        onChange={(category) => onChange({ category })}
        filterable
      />
      <Select
        label="Confidence"
        options={confidences}
        value={state.confidence}
        unsetValue="any"
        onChange={(confidence) => onChange({ confidence })}
      />
      <Select
        label="Difficulty"
        options={difficulties}
        value={state.difficulty}
        unsetValue="any"
        onChange={(difficulty) => onChange({ difficulty })}
      />
    </>
  )
}
