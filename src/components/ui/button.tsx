import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet'
type Size = 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-white hover:border-accent-ink hover:bg-accent-ink',
  secondary: 'border-rule-strong bg-surface text-ink hover:border-ink-3',
  ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border-flag bg-flag text-white hover:brightness-92',
  'danger-quiet': 'border-transparent bg-transparent text-flag hover:border-flag',
}

const SIZE: Record<Size, string> = {
  md: 'px-3.5 py-2.5 text-label',
  lg: 'px-[18px] py-3 text-body',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  loading = false,
  loadingLabel,
  children,
  className = '',
  disabled,
  ...props
}: ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
  /* DESIGN.md: an action keeps its name through the whole flow. */
  loadingLabel?: string
}) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={`inline-flex cursor-pointer items-center gap-[7px] rounded-md border font-body font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45 ${
        VARIANT[variant]
      } ${SIZE[size]} ${block ? 'w-full justify-center' : ''} ${className}`}
    >
      {loading ? (
        /*
          Decorative. Under reduced motion it stops spinning and stays a visible
          ring — the label is what carries the meaning either way.
        */
        <span
          aria-hidden="true"
          className="size-[13px] animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
        />
      ) : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}
