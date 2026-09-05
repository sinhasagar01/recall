'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * One button. No options, no format picker, no preview.
 *
 * It fetches rather than being a plain `<a download>` because a plain link gives
 * the page no way to say anything while the server works — and a library with
 * images is not instant. The cost is that the browser holds the finished zip in
 * memory before saving it. The route still streams, which is what keeps the
 * SERVER from holding it and what keeps the response under Vercel's
 * non-streaming ceiling; only the client buffers.
 */
export function ExportButton() {
  const [isPreparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setPreparing(true)
    setError(null)

    try {
      const response = await fetch('/export')
      if (!response.ok) throw new Error(`The export failed (${response.status}).`)

      // The filename the server chose, so the date in it is the server's.
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'recall.zip'

      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export failed.')
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="mt-4">
      <Button onClick={download} loading={isPreparing} loadingLabel="Preparing…">
        Export my library
      </Button>

      {error ? (
        <p role="alert" className="mt-2.5 font-mono text-[11.5px] text-flag">
          {error}
        </p>
      ) : null}
    </div>
  )
}
