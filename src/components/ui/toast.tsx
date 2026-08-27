'use client'

/*
  A pill at the bottom of the screen. role="status" so it is announced without
  stealing focus; the error variant uses role="alert" because it interrupts.
*/
export function Toast({
  message,
  tone = 'default',
  action,
}: {
  message: string
  tone?: 'default' | 'error'
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`fixed bottom-7 left-1/2 z-70 flex -translate-x-1/2 items-center gap-[9px] rounded-full px-[15px] py-[9px] font-mono text-mono-md ${
        tone === 'error' ? 'bg-flag text-white' : 'bg-ink text-bg'
      }`}
    >
      {message}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="cursor-pointer text-inherit underline opacity-75 hover:opacity-100"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
