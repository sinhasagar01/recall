'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatBytes, MAX_IMAGE_BYTES } from '@/lib/domain/mental-model-image'

export type PickedImage = { file: File; previewUrl: string } | null

/**
 * The dropzone, and the attached / failed states around it.
 *
 * Upload happens after the topic is saved, because the object path needs the topic
 * id — so this field only *picks* a file. The sheet owns the upload.
 */
export function ImageField({
  picked,
  existingName,
  onPick,
  onClear,
  uploading,
  onCancel,
  error,
}: {
  picked: PickedImage
  existingName: string | null
  onPick: (file: File) => void
  onClear: () => void
  uploading: boolean
  onCancel: () => void
  error: string | null
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const name = picked?.file.name ?? existingName
  const size = picked ? formatBytes(picked.file.size) : null

  return (
    <div className="mb-[18px]">
      <label htmlFor="mental-model-image" className="mb-1.5 block text-label font-medium text-ink">
        Visual
        <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
          optional · png, jpeg, webp · {formatBytes(MAX_IMAGE_BYTES)}
        </span>
      </label>

      <input
        ref={inputRef}
        id="mental-model-image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onPick(file)
          event.target.value = ''
        }}
      />

      {uploading ? (
        <div className="flex items-center gap-3 rounded-md border border-rule bg-surface-2 px-3 py-2.5">
          <Thumb />
          <div className="min-w-0 flex-1">
            <div className="truncate text-label font-medium">{name}</div>
            {/*
              Indeterminate on purpose. @supabase/storage-js `upload()` exposes no
              progress callback, so a percentage would be invented. The bar shows
              that something is happening and claims no number.
            */}
            <div
              role="progressbar"
              aria-label="Uploading the image"
              className="mt-[7px] h-[3px] overflow-hidden rounded-[2px] bg-rule"
            >
              <i className="block h-full w-1/3 animate-[indeterminate_1.1s_ease-in-out_infinite] rounded-[2px] bg-accent" />
            </div>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : name ? (
        <div className="flex items-center gap-3 rounded-md border border-rule bg-surface-2 px-3 py-2.5">
          <Thumb tone={error ? 'error' : 'default'} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-label font-medium">{name}</div>
            <div className={`font-mono text-[11.5px] ${error ? 'text-flag' : 'text-ink-3'}`}>
              {error ? 'not attached' : (size ?? 'attached')}
            </div>
          </div>
          <Button onClick={() => inputRef.current?.click()}>
            {error ? 'Choose another' : 'Replace'}
          </Button>
          <Button variant="danger-quiet" onClick={onClear}>
            Remove
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) onPick(file)
          }}
          data-dragging={dragging}
          className={`flex items-center gap-3 rounded-md border border-dashed p-[18px] text-label ${
            dragging
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-rule-strong bg-surface-2 text-ink-2'
          }`}
        >
          <Thumb />
          <span>
            Drop a diagram here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer text-accent-ink underline"
            >
              choose a file
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

function Thumb({ tone = 'default' }: { tone?: 'default' | 'error' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-11 w-14 shrink-0 place-items-center rounded-sm border border-rule ${
        tone === 'error'
          ? 'bg-flag-soft text-flag'
          : 'bg-gradient-to-br from-accent-soft to-surface text-accent'
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 17 5-5 4 4 3-2 4 4" />
      </svg>
    </span>
  )
}
