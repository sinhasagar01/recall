'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SourceSheet } from '@/components/sources/source-sheet'

export function AddSourceButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <SourceSheet onClose={() => setOpen(false)} /> : null}
    </>
  )
}
