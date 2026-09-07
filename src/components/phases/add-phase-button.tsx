'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhaseSheet } from '@/components/phases/phase-sheet'

export function AddPhaseButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <PhaseSheet onClose={() => setOpen(false)} /> : null}
    </>
  )
}
