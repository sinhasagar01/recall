import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select, type SelectOption } from '@/components/ui/select'

const CATEGORIES: SelectOption[] = [
  { value: 'all', label: 'All categories', count: 48 },
  { value: 'React', label: 'React', count: 14 },
  { value: 'JavaScript', label: 'JavaScript', count: 9 },
  { value: 'CSS', label: 'CSS', count: 5 },
]

function renderSelect(props: Partial<React.ComponentProps<typeof Select>> = {}) {
  const onChange = vi.fn()
  render(
    <Select
      label="Category"
      options={CATEGORIES}
      value="all"
      unsetValue="all"
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, trigger: screen.getByRole('button', { name: /Category/ }) }
}

describe('Select — opening and closing', () => {
  it('is a listbox trigger, not a native select', async () => {
    const { trigger } = renderSelect()

    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens on click and exposes the listbox and its options', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(CATEGORIES.length)
  })

  it('marks the current value as the selected option', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect({ value: 'React' })

    await user.click(trigger)

    expect(screen.getByRole('option', { name: /React/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /CSS/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('Select — keyboard navigation', () => {
  it('moves the active option with the arrow keys', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)
    const listbox = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')

    // Opens on the selected option.
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0].id)

    await user.keyboard('{ArrowDown}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[1].id)

    await user.keyboard('{ArrowDown}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[2].id)

    await user.keyboard('{ArrowUp}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[1].id)
  })

  it('does not run off either end', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)
    const listbox = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')

    await user.keyboard('{ArrowUp}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0].id)

    await user.keyboard('{End}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[options.length - 1].id)

    await user.keyboard('{ArrowDown}')
    expect(listbox).toHaveAttribute('aria-activedescendant', options[options.length - 1].id)
  })

  it('selects the active option with Enter, then closes and restores focus', async () => {
    const user = userEvent.setup()
    const { trigger, onChange } = renderSelect()

    await user.click(trigger)
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledExactlyOnceWith('React')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('selects on click too', async () => {
    const user = userEvent.setup()
    const { trigger, onChange } = renderSelect()

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: /CSS/ }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('CSS')
  })
})

describe('Select — the set state', () => {
  it('is not "set" while the value is the unset one', () => {
    const { trigger } = renderSelect({ value: 'all' })
    expect(trigger.dataset.set).toBe('false')
  })

  it('is "set" once the value is anything else', () => {
    const { trigger } = renderSelect({ value: 'React' })
    expect(trigger.dataset.set).toBe('true')
  })
})

describe('Select — counts and the category variant', () => {
  it('shows each option count from the user own data', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect()

    await user.click(trigger)

    expect(screen.getByRole('option', { name: /React/ })).toHaveTextContent('14')
    expect(screen.getByRole('option', { name: /JavaScript/ })).toHaveTextContent('9')
  })

  it('filters as you type when filtering is enabled', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect({ filterable: true })

    await user.click(trigger)
    await user.type(screen.getByRole('searchbox'), 'ja')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /JavaScript/ })).toBeInTheDocument()
  })

  it('filters case-insensitively and reports when nothing matches', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect({ filterable: true })

    await user.click(trigger)
    await user.type(screen.getByRole('searchbox'), 'REACT')
    expect(screen.getAllByRole('option')).toHaveLength(1)

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'kubernetes')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('keeps arrow keys working while the filter input has focus', async () => {
    const user = userEvent.setup()
    const { trigger, onChange } = renderSelect({ filterable: true })

    await user.click(trigger)
    await user.type(screen.getByRole('searchbox'), 'a')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('groups options when a group is given', async () => {
    const user = userEvent.setup()
    const { trigger } = renderSelect({
      options: [
        { value: 'React', label: 'React', count: 14, group: 'Suggested from your topic' },
        ...CATEGORIES,
      ],
    })

    await user.click(trigger)
    expect(screen.getByText('Suggested from your topic')).toBeInTheDocument()
  })
})
