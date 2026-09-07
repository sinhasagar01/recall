'use client'

import { useState } from 'react'
import { LedgerSheet } from '@/components/ledger/ledger-sheet'
import { Button } from '@/components/ui/button'

export function AddItemButton({
  label,
  capabilityOptions,
}: {
  label: string
  capabilityOptions: { phase: string; options: { id: string; name: string }[] }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <LedgerSheet capabilityOptions={capabilityOptions} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
