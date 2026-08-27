import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TagsInput } from '@/components/ui/tags-input'

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
  return <TagsInput label="Tags" tags={tags} onChange={setTags} />
}

const entry = () => screen.getByRole('textbox', { name: /Tags/ })

describe('TagsInput', () => {
  it('adds a tag on Enter and clears the entry', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(entry(), 'rendering{Enter}')

    expect(screen.getByText('rendering')).toBeInTheDocument()
    expect(entry()).toHaveValue('')
  })

  it('adds a tag on comma', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(entry(), 'performance,')

    expect(screen.getByText('performance')).toBeInTheDocument()
  })

  it('trims surrounding whitespace', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(entry(), '   hydration   {Enter}')

    expect(screen.getByText('hydration')).toBeInTheDocument()
  })

  it('ignores a blank entry', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(entry(), '   {Enter}')

    expect(screen.queryAllByTestId('tag')).toHaveLength(0)
  })

  it('refuses a duplicate, case-insensitively', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['rendering']} />)

    await user.type(entry(), 'Rendering{Enter}')

    expect(screen.getAllByTestId('tag')).toHaveLength(1)
  })

  it('removes a tag by its own button, which names the tag', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['rendering', 'performance']} />)

    await user.click(screen.getByRole('button', { name: 'Remove tag rendering' }))

    expect(screen.queryByText('rendering')).not.toBeInTheDocument()
    expect(screen.getByText('performance')).toBeInTheDocument()
  })

  it('removes the last tag with Backspace on an empty entry', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['rendering', 'performance']} />)

    await user.click(entry())
    await user.keyboard('{Backspace}')

    expect(screen.queryByText('performance')).not.toBeInTheDocument()
    expect(screen.getByText('rendering')).toBeInTheDocument()
  })

  it('leaves the tags alone when Backspace is pressed with text in the entry', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['rendering']} />)

    await user.type(entry(), 'ab{Backspace}')

    expect(screen.getAllByTestId('tag')).toHaveLength(1)
    expect(entry()).toHaveValue('a')
  })
})
