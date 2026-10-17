'use client'

import { Button } from '@/components/ui/button'
import { StateBlock } from '@/components/ui/state-block'

export function RouteError({ error, reset, title = "Couldn't load this page" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  return (
    <StateBlock
      tone="error"
      icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5v.5" /></svg>}
      title={title}
      body="The request did not finish. Your saved work is safe—try again in a moment."
      action={<Button variant="primary" onClick={reset}>Try again</Button>}
      footnote={error.message}
    />
  )
}
