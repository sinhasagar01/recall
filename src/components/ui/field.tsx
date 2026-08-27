import type { ComponentProps } from 'react'
import { useId } from 'react'

/**
 * Label, optional mono hint, input, and the error row.
 *
 * The error sits OUTSIDE the label and is wired with aria-invalid,
 * aria-describedby and role="alert". design-reference.html nests it inside the
 * label, which folds the error text into the input's accessible name — see
 * DESIGN.md section 6, where the mock is explicitly not authoritative on this.
 */
export function Field({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string; error?: string | null }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="mb-[18px]">
      <label htmlFor={inputId} className="mb-1.5 block text-label font-medium text-ink">
        {label}
        {hint ? (
          <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">{hint}</span>
        ) : null}
      </label>

      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-md border bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 ${
          error
            ? 'border-flag focus:border-flag focus:outline-2 focus:outline-flag'
            : 'border-rule-strong focus:border-accent focus:outline-2 focus:outline-accent'
        } ${className}`}
      />

      {error ? (
        /* Icon plus text: colour never carries the meaning alone. */
        <p id={errorId} role="alert" className="mt-1.5 flex items-center gap-1.5 text-meta text-flag">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6" />
            <path d="M12 16.5v.5" />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  )
}
