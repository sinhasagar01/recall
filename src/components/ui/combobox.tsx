'use client'

import { useId, useMemo, useRef, useState } from 'react'

/**
 * A text field that suggests what you have used before, and accepts what you type.
 *
 * ── Why this is not `Select` with `filterable` ──────────────────────────────
 * `Select`'s value model is closed: `value` must be one of `options`, and the
 * trigger renders `selected?.label`. `filterable` filters an existing list; it
 * does not accept a value that is not in it. A combobox's value is arbitrary
 * text held by the input itself — the list is a convenience, not a constraint.
 * Widening Select to do both would change the model every existing call site
 * depends on, to serve one new one.
 *
 * What it *does* copy from `select.tsx`, because that is the shipped a11y
 * baseline and two overlays that trap focus differently is how one of them ends
 * up wrong: `aria-expanded` / `aria-controls` on the control, `role="listbox"`
 * on the popup and `role="option"` on each row, the active option tracked with
 * `aria-activedescendant` rather than roving focus, and full keyboard operation.
 * The difference is `role="combobox"` on a real `<input>`.
 *
 * ── The list opens OVER what is below it ────────────────────────────────────
 * Absolutely positioned, so the fields beneath do not move when it opens and
 * only one of the two states is ever on screen. The mock originally drew the
 * open list and the filled form as one picture, which made the popup look like
 * it pushed the form down.
 */
export interface ComboboxOption {
  value: string
  /** Shown greyed to the right — "4 lessons". Never the thing you match on. */
  detail?: string
}

export function Combobox({
  label,
  hint,
  name,
  value,
  options,
  placeholder,
  newLabel,
  onChange,
  inputRef,
}: {
  label: string
  hint?: string
  name: string
  value: string
  options: ComboboxOption[]
  placeholder?: string
  /** e.g. `(text) => \`Use “${text}” as a new course\`` */
  newLabel: (text: string) => string
  onChange: (value: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ownRef = useRef<HTMLInputElement>(null)
  const field = inputRef ?? ownRef

  const trimmed = value.trim()

  const matches = useMemo(() => {
    if (trimmed === '') return options
    const needle = trimmed.toLowerCase()
    return options.filter((option) => option.value.toLowerCase().includes(needle))
  }, [options, trimmed])

  /*
    The "use what I typed" row appears only when the text is not already an exact
    option — offering "Use 'Closures'" under an existing "Closures" is offering a
    choice that makes no difference.
  */
  const offersNew =
    trimmed !== '' && !options.some((option) => option.value.toLowerCase() === trimmed.toLowerCase())

  const rows: { value: string; label: string; detail?: string; isNew?: boolean }[] = [
    ...matches.map((option) => ({ value: option.value, label: option.value, detail: option.detail })),
    ...(offersNew ? [{ value: trimmed, label: newLabel(trimmed), isNew: true }] : []),
  ]

  const clamped = Math.min(active, Math.max(0, rows.length - 1))
  const optionId = (index: number) => `${baseId}-option-${index}`

  const choose = (index: number) => {
    const row = rows[index]
    if (!row) return
    onChange(row.value)
    setOpen(false)
    setActive(0)
  }

  return (
    <div className="mb-[18px]">
      <label htmlFor={baseId} className="mb-1.5 block text-label font-medium text-ink">
        {label}
        {hint ? (
          <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">{hint}</span>
        ) : null}
      </label>

      <div className="relative">
        <input
          ref={field}
          id={baseId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? `${baseId}-listbox` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && rows.length > 0 ? optionId(clamped) : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          /*
            A blur closes it, but not before a click on an option has landed —
            mousedown fires first and is prevented on the list, so focus never
            leaves and this never runs for a pick.
          */
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              return
            }
            if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              setOpen(true)
              return
            }
            if (!open || rows.length === 0) return

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((current) => (current + 1) % rows.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((current) => (current - 1 + rows.length) % rows.length)
            } else if (event.key === 'Enter') {
              // Only when a suggestion is highlighted — otherwise Enter is the
              // form's, and typing a new course then pressing it should submit.
              event.preventDefault()
              choose(clamped)
            }
          }}
          className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
        />

        {open && rows.length > 0 ? (
          <ul
            id={`${baseId}-listbox`}
            role="listbox"
            /*
              Deliberately does NOT begin with the field's own label.

              `aria-label={label}` collided outright — `getByLabel('Course')`
              matched the input and its popup. `${label} suggestions` still
              collided, because the natural locator is a prefix regex
              (`/^Course/`, needed because the hint text is inside the label) and
              "Course suggestions" starts with "Course" too. Both were found by
              the suite going ambiguous the moment there was something to suggest.

              Leading with "Suggestions" makes the name accurate AND unambiguous
              under a prefix match. It is also what the element is: the
              suggestions, not the field.
            */
            aria-label={`Suggestions for ${label.toLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 max-h-[240px] list-none overflow-auto rounded-md border border-rule-strong bg-surface py-1 shadow-[0_4px_16px_rgba(18,19,26,.10)]"
          >
            {rows.map((row, index) => (
              <li key={`${row.value}-${index}`}>
                <button
                  type="button"
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === clamped}
                  data-testid={row.isNew ? 'combobox-new' : 'combobox-option'}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full cursor-pointer items-baseline gap-3 px-3 py-2 text-left text-option ${
                    index === clamped ? 'bg-surface-2' : ''
                  } ${row.isNew ? 'text-accent-ink' : 'text-ink'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {row.detail ? (
                    <span className="flex-none font-mono text-[11px] text-ink-3">{row.detail}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
