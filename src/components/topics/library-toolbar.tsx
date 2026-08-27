'use client'

import { Button } from '@/components/ui/button'
import { QuickFilterChip } from '@/components/ui/chip'
import { Kbd } from '@/components/ui/kbd'
import { Select } from '@/components/ui/select'
import type { CategoryOption } from '@/lib/domain/library'
import type { QuickFilter } from '@/lib/domain/search-filter'

export interface ToolbarState {
  query: string
  category: string
  confidence: string
  difficulty: string
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
}: {
  state: ToolbarState
  onChange: (next: Partial<ToolbarState>) => void
  onClear: () => void
  categories: CategoryOption[]
  confidences: CategoryOption[]
  difficulties: CategoryOption[]
  quickCounts: Record<QuickFilter, number>
}) {
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
    state.quickFilters.length > 0

  return (
    <>
      <div className="mb-[26px] flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute top-1/2 left-[11px] flex -translate-y-1/2 text-ink-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            aria-label="Search your knowledge"
            placeholder="Search your knowledge…"
            value={state.query}
            onChange={(event) => onChange({ query: event.target.value })}
            className="w-full rounded-md border border-rule-strong bg-surface py-2.5 pr-10 pl-[34px] text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
            <Kbd>/</Kbd>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
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
            align="right"
          />
          {isFiltered ? (
            <Button variant="ghost" onClick={onClear} className="font-mono text-[11.5px]">
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/*
        Each chip carries its count. A chip that would match nothing reads
        "Recently added 0" and explains itself, where a disabled chip only says
        "no" — and after a quiet fortnight the 7-day window makes that common.
      */}
      <div className="mt-[-14px] mb-[22px] flex flex-wrap gap-1.5">
        {(
          [
            ['never-practiced', 'Never practiced'],
            ['recently-added', 'Recently added'],
            ['recently-practiced', 'Recently practiced'],
          ] as const
        ).map(([value, label]) => (
          <QuickFilterChip
            key={value}
            pressed={state.quickFilters.includes(value)}
            onClick={() => toggleQuick(value)}
          >
            {label} {quickCounts[value]}
          </QuickFilterChip>
        ))}
      </div>
    </>
  )
}
