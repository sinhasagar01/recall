import { Kbd } from '@/components/ui/kbd'

/*
  Layout only this phase. Every control is genuinely disabled and says so, rather
  than accepting input and silently discarding it. Phase 7 wires these to the
  already-tested domain functions in search-filter.ts.
*/
const NOT_YET = 'Search and filters arrive in the next phase'

export function LibraryToolbar() {
  return (
    <div className="mb-[26px] flex flex-wrap items-center gap-2.5" aria-describedby="toolbar-note">
      <div className="relative min-w-[240px] flex-1">
        <span className="pointer-events-none absolute top-1/2 left-[11px] flex -translate-y-1/2 text-ink-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          disabled
          title={NOT_YET}
          aria-label="Search your knowledge"
          placeholder="Search your knowledge…"
          className="w-full rounded-md border border-rule-strong bg-surface py-2.5 pr-10 pl-[34px] text-body text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
          <Kbd>/</Kbd>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['All categories', 'Any confidence', 'Any difficulty'].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            title={NOT_YET}
            className="inline-flex cursor-not-allowed items-center gap-[9px] rounded-md border border-rule-strong bg-surface py-2 pr-2.5 pl-3 font-mono text-mono-md text-ink-2 opacity-60"
          >
            {label}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" className="opacity-70">
              <path d="m5 8 7 7 7-7" />
            </svg>
          </button>
        ))}
      </div>

      <p id="toolbar-note" className="w-full font-mono text-mono text-ink-3">
        {NOT_YET}.
      </p>
    </div>
  )
}
