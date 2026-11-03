'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Result = { imported: number; imagesImported: number; imagesSkipped: number }

/** Imports a Recall export as additional entries. The server never updates existing rows. */
export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const importArchive = async (file: File | undefined) => {
    if (!file) return
    setImporting(true); setError(null); setResult(null)
    try {
      const body = new FormData(); body.set('archive', file)
      const response = await fetch('/import', { method: 'POST', body })
      const payload = await response.json() as Result & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'The import failed.')
      setResult(payload)
      if (inputRef.current) inputRef.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import failed.')
    } finally {
      setImporting(false)
    }
  }

  return <div className="mt-4">
    <input ref={inputRef} className="sr-only" type="file" accept="application/zip,.zip" onChange={(event) => importArchive(event.target.files?.[0])} />
    <Button variant="secondary" onClick={() => inputRef.current?.click()} loading={isImporting} loadingLabel="Adding to library…">Import a Recall export</Button>
    <p className="mt-2 text-meta text-ink-3">Adds topics and quizzes as new entries. It never replaces your current library.</p>
    {result ? <p role="status" className="mt-2.5 font-mono text-[11.5px] text-ink-2">Added {result.imported} {result.imported === 1 ? 'entry' : 'entries'}{result.imagesImported ? ` and ${result.imagesImported} image${result.imagesImported === 1 ? '' : 's'}` : ''}.{result.imagesSkipped ? ` ${result.imagesSkipped} image${result.imagesSkipped === 1 ? ' was' : 's were'} skipped.` : ''}</p> : null}
    {error ? <p role="alert" className="mt-2.5 font-mono text-[11.5px] text-flag">{error}</p> : null}
  </div>
}
