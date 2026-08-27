'use client'

import { useId, useRef, useState } from 'react'

/** Free-text tags. Enter or comma commits; Backspace on an empty entry removes. */
export function TagsInput({
  label,
  hint,
  tags,
  onChange,
}: {
  label: string
  hint?: string
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const tag = draft.trim()
    setDraft('')
    if (tag === '') return
    // Case-insensitive: "React" and "react" are the same tag, and two of them
    // would split the same topic across two filters later.
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return
    onChange([...tags, tag])
  }

  return (
    <div className="mb-[18px]">
      <label htmlFor={inputId} className="mb-1.5 block text-label font-medium text-ink">
        {label}
        {hint ? (
          <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">{hint}</span>
        ) : null}
      </label>

      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-[9px] py-[7px] has-[:focus-visible]:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-1 has-[:focus-visible]:outline-accent"
      >
        {tags.map((tag) => (
          <span
            key={tag}
            data-testid="tag"
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface-2 py-[3px] pr-1 pl-[9px] font-mono text-[11.5px] text-ink-2"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((existing) => existing !== tag))}
              className="cursor-pointer rounded-full px-1 leading-none hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          placeholder="add a tag…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              commit()
              return
            }
            if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
              event.preventDefault()
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={commit}
          className="min-w-[120px] flex-1 border-none bg-transparent py-0.5 text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  )
}
