'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Kbd } from '@/components/ui/kbd'

export type SelectOption = {
  value: string
  label: string
  /** From the user's own data. The counts are the reason this isn't a native select. */
  count?: number
  group?: string
}

/**
 * The listbox from DESIGN.md section 2. Not a native <select>: a trigger button
 * plus a popover, because the options carry counts and grouping that a native
 * select cannot show.
 *
 * Keyboard: ArrowUp/Down move, Home/End jump, Enter selects, Escape closes and
 * returns focus to the trigger. Focus stays on the trigger (or the filter input)
 * throughout and the active option is tracked with aria-activedescendant, which
 * is what lets typing filter and arrow keys navigate at the same time.
 */
export function Select({
  label,
  options,
  value,
  unsetValue,
  onChange,
  filterable = false,
  align = 'left',
}: {
  label: string
  options: SelectOption[]
  value: string
  /** The "All"/"Any" value. The trigger is styled as set for anything else. */
  unsetValue: string
  onChange: (value: string) => void
  filterable?: boolean
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rawActiveIndex, setActiveIndex] = useState(0)

  const baseId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)

  const visible = useMemo(() => {
    if (!filterable || query.trim() === '') return options
    const needle = query.trim().toLowerCase()
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [filterable, options, query])

  const selected = options.find((option) => option.value === value)
  const optionId = (index: number) => `${baseId}-option-${index}`

  /*
    Clamped at read time rather than corrected by an effect. Filtering can shorten
    the list out from under the active index, and syncing that with setState in an
    effect costs an extra render pass for a value that is simply derivable.
  */
  const activeIndex = Math.min(rawActiveIndex, Math.max(visible.length - 1, 0))

  // Escape and selection both hand focus back to the trigger.
  useEffect(() => {
    if (open || !restoreFocus.current) return
    restoreFocus.current = false
    triggerRef.current?.focus()
  }, [open])

  const close = ({ restore }: { restore: boolean }) => {
    restoreFocus.current = restore
    setOpen(false)
    setQuery('')
  }

  const choose = (index: number) => {
    const option = visible[index]
    if (!option) return
    onChange(option.value)
    close({ restore: true })
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((current) => Math.min(current + 1, visible.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((current) => Math.max(current - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(Math.max(visible.length - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        close({ restore: true })
        break
    }
  }

  // Clicking away closes without stealing focus back.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close({ restore: false })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const isSet = value !== unsetValue

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-listbox` : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        data-set={isSet}
        onClick={() => {
          if (open) {
            close({ restore: false })
            return
          }
          // Reopening lands on the current value, not wherever it was left.
          const index = options.findIndex((option) => option.value === value)
          setActiveIndex(index === -1 ? 0 : index)
          setOpen(true)
        }}
        onKeyDown={open && !filterable ? onKeyDown : undefined}
        className={`inline-flex cursor-pointer items-center gap-[9px] rounded-md border py-2 pr-2.5 pl-3 font-mono text-mono-md whitespace-nowrap ${
          isSet
            ? 'border-accent bg-accent-soft text-accent-ink'
            : 'border-rule-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
        } ${open ? 'border-accent text-ink outline-2 -outline-offset-1 outline-accent' : ''}`}
      >
        {selected?.label ?? label}
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
          className="shrink-0 opacity-70"
        >
          <path d="m5 8 7 7 7-7" />
        </svg>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className={`absolute top-[calc(100%+6px)] z-40 min-w-[230px] rounded-lg border border-rule-strong bg-surface p-[5px] shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {filterable ? (
            <div className="mb-[5px] border-b border-rule px-1.5 pt-1.5 pb-2">
              <input
                type="search"
                role="searchbox"
                autoFocus
                aria-label={`Filter ${label.toLowerCase()}`}
                aria-controls={`${baseId}-listbox`}
                aria-activedescendant={visible.length > 0 ? optionId(activeIndex) : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Filter…"
                className="w-full border-none bg-transparent px-1 py-[3px] font-mono text-mono-md text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          ) : null}

          <div
            id={`${baseId}-listbox`}
            role="listbox"
            aria-label={label}
            aria-activedescendant={visible.length > 0 ? optionId(activeIndex) : undefined}
            tabIndex={filterable ? -1 : 0}
            onKeyDown={filterable ? undefined : onKeyDown}
            ref={(node) => {
              if (node && !filterable) node.focus()
            }}
            className="max-h-[266px] overflow-auto outline-none"
          >
            {visible.length === 0 ? (
              <p className="px-2.5 py-2 font-mono text-mono-sm text-ink-3">No matches</p>
            ) : null}

            {visible.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex
              // A heading appears at each point the group changes.
              const groupHeading =
                option.group && option.group !== visible[index - 1]?.group ? option.group : null

              return (
                <div key={option.value}>
                  {groupHeading ? (
                    <div className="px-2.5 pt-[9px] pb-[5px] font-mono text-mono-xs tracking-[0.14em] text-ink-3 uppercase">
                      {groupHeading}
                    </div>
                  ) : null}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(index)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full cursor-pointer items-center gap-[9px] rounded-sm px-2.5 py-2 text-left text-option ${
                      isSelected ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink'
                    } ${isActive && !isSelected ? 'bg-surface-2' : ''}`}
                  >
                    <span className={`flex w-3.5 shrink-0 text-accent ${isSelected ? '' : 'opacity-0'}`}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    </span>
                    {option.label}
                    {option.count !== undefined ? (
                      <span className="ml-auto font-mono text-mono-sm text-ink-3">{option.count}</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-[5px] flex items-center justify-between border-t border-rule px-2.5 pt-[7px] pb-1">
            <span className="font-mono text-mono text-ink-3">
              <Kbd>↑↓</Kbd> move · <Kbd>↵</Kbd> select
            </span>
            <span className="font-mono text-mono text-ink-3">
              <Kbd>Esc</Kbd>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

