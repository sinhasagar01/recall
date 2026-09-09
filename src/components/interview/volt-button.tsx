import type { ComponentProps } from 'react'

/**
 * The interview's primary button — `.btn--volt` in the reference.
 *
 * ── Why this is not a variant on `ui/button.tsx` ────────────────────────────
 * Two reasons, and either alone would be enough.
 *
 * `interview-boundary.test.ts` allows the scale to be named only under
 * `app/(interview)` and `components/interview`. A `volt` variant in `components/ui`
 * would name `--volt` outside the tree and fail that guard — which is the guard
 * working, not an inconvenience: a shared button offering an interview gradient
 * is exactly how a 0–100 scale reaches a topic card.
 *
 * And overriding through `className` would hit the bug that component's own
 * doc comment records. Tailwind resolves two utilities in the same group by
 * stylesheet order, not class order, so `bg-[image:var(--volt-grad)]` layered
 * over a variant's `bg-accent` is a coin flip that fails silently.
 *
 * The cost, stated: a second button implementation, kept to the shape, spinner
 * and `aria-busy` of the shared one so the two cannot drift in behaviour. What
 * differs is only paint.
 */
export function VoltButton({
  size = 'md',
  loading = false,
  loadingLabel,
  /**
   * The start card's variant: flat indigo on the mesh rather than a gradient.
   *
   * A gradient on a gradient reads as a smudge — the reference gives the button
   * inside `.startcard` its own flat fill for that reason, and this is that.
   */
  flat = false,
  children,
  className = '',
  disabled,
  ...props
}: ComponentProps<'button'> & {
  size?: 'md' | 'lg'
  loading?: boolean
  loadingLabel?: string
  flat?: boolean
}) {
  return (
    <button
      {...props}
      /*
        `disabled ?? loading` is what the shared button does, and it is a nullish
        fallback — an explicit `false` defeats the loading guard entirely. Written
        as an OR here instead: a loading button is never interactive, and this one
        has no caller that needs to force it live.
      */
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-md border font-body font-semibold whitespace-nowrap text-white transition-[background,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        flat
          ? 'border-[var(--indigo-2)] bg-[var(--indigo-2)] hover:not-disabled:border-[var(--indigo)] hover:not-disabled:bg-[var(--indigo)]'
          : 'border-[var(--volt)] [background-image:var(--volt-grad)] [box-shadow:var(--volt-glow)] hover:not-disabled:border-[var(--volt-2)] hover:not-disabled:[background-image:var(--volt-grad-hover)]'
      } ${size === 'lg' ? 'px-[22px] py-[13px] text-[15px]' : 'px-[15px] py-2.5 text-label'} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-[13px] animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
        />
      ) : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}
