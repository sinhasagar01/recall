import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ImageField, type PickedImage } from '@/components/topics/image-field'

const file = (name = 'diagram.png') => new File(['x'], name, { type: 'image/png' })

function Harness({ uploading = false, onCancel = vi.fn() }) {
  const [picked, setPicked] = useState<PickedImage>(null)
  return (
    <ImageField
      picked={picked}
      existingName={null}
      onPick={(f) => setPicked({ file: f, previewUrl: 'blob:x' })}
      onClear={() => setPicked(null)}
      uploading={uploading}
      onCancel={onCancel}
      error={null}
    />
  )
}

describe('ImageField — the dropzone', () => {
  it('highlights while a file is dragged over it', async () => {
    render(<Harness />)
    const zone = screen.getByText(/Drop a diagram here/).closest('div')!

    expect(zone.dataset.dragging).toBe('false')

    await userEvent.setup()
    // fireEvent-level, because userEvent has no drag primitive.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    expect(zone.dataset.dragging).toBe('true')

    fireEvent.dragLeave(zone)
    expect(zone.dataset.dragging).toBe('false')
  })

  it('accepts a dropped file and stops highlighting', async () => {
    render(<Harness />)
    const zone = screen.getByText(/Drop a diagram here/).closest('div')!

    const { fireEvent } = await import('@testing-library/react')
    fireEvent.drop(zone, { dataTransfer: { files: [file('dropped.png')] } })

    expect(screen.getByText('dropped.png')).toBeInTheDocument()
    expect(screen.queryByText(/Drop a diagram here/)).not.toBeInTheDocument()
  })

  it('offers Replace and Remove once a file is chosen', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.upload(screen.getByLabelText(/Visual/), file('chosen.png'))

    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('clears the choice on Remove', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.upload(screen.getByLabelText(/Visual/), file('gone.png'))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(screen.getByText(/Drop a diagram here/)).toBeInTheDocument()
  })

  it('shows an indeterminate progress bar while uploading, and can be cancelled', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<Harness uploading onCancel={onCancel} />)

    const bar = screen.getByRole('progressbar', { name: 'Uploading the image' })
    // Indeterminate on purpose: storage-js reports no progress, so any number
    // shown here would be invented.
    expect(bar).not.toHaveAttribute('aria-valuenow')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
