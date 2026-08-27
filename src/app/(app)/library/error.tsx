'use client'

import { Button } from '@/components/ui/button'
import { StateBlock } from '@/components/ui/state-block'

export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <>
      <div className="mb-[22px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
          My knowledge
        </h1>
      </div>

      <StateBlock
        tone="error"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6" />
            <path d="M12 16.5v.5" />
          </svg>
        }
        title="Couldn't load your topics"
        body="The request to the database failed. Your topics are safe — this is a connection problem, not a data problem."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
        /* The real reason, as the mock shows it. Never a generic apology. */
        footnote={error.message}
      />
    </>
  )
}
