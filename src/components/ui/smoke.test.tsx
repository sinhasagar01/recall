import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Inline JSX, not an imported component: phase 0 ships no application code.
function Harness() {
  return <h1>Recall</h1>
}

describe('vitest components project', () => {
  it('renders into a jsdom document with jest-dom matchers available', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recall')
  })
})
