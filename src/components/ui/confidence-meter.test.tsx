import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'

const filledCount = () =>
  screen.getAllByTestId('confidence-tick').filter((tick) => tick.dataset.filled === 'true').length

describe('ConfidenceMeter — fill count encodes the state', () => {
  it.each([
    ['new', 0],
    ['weak', 1],
    ['okay', 2],
    ['strong', 3],
  ] as const)('%s fills %i of three ticks', (confidence, expected) => {
    render(<ConfidenceMeter confidence={confidence} />)

    expect(screen.getAllByTestId('confidence-tick')).toHaveLength(3)
    expect(filledCount()).toBe(expected)
  })
})

describe('ConfidenceMeter — meaning never rests on colour alone', () => {
  it.each([
    ['new', 'Never practiced'],
    ['weak', 'Weak'],
    ['okay', 'Okay'],
    ['strong', 'Strong'],
  ] as const)('%s is labelled "%s"', (confidence, label) => {
    render(<ConfidenceMeter confidence={confidence} showLabel />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('says "Never practiced", never "New"', () => {
    render(<ConfidenceMeter confidence="new" showLabel />)
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('still carries an accessible name when the label is hidden', () => {
    // A bare row of ticks is meaningless to a screen reader.
    render(<ConfidenceMeter confidence="weak" />)
    expect(screen.getByRole('img', { name: 'Weak' })).toBeInTheDocument()
  })
})
