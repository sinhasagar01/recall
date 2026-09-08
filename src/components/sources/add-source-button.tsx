'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SourceSheet } from '@/components/sources/source-sheet'
import type { SourceSummary } from '@/lib/domain/sources'

/**
 * `siblings` is every source you already have, and it is what makes the two
 * comboboxes work: course offers what you have used with a lesson count, chapter
 * offers only the chapters inside the course you picked. Passed from the server
 * page rather than fetched here — the list is already loaded for the page it
 * sits on.
 */
export function AddSourceButton({
  label,
  siblings = [],
}: {
  label: string
  siblings?: SourceSummary[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <SourceSheet siblings={siblings} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
