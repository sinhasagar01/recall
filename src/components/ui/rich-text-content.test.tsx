import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichTextContent } from '@/components/ui/rich-text-content'

describe('RichTextContent', () => {
  it('renders a fenced code block as code without interpreting its contents as prose', () => {
    render(<RichTextContent value={'Before\n\n```javascript\nconst value = "**not bold**"\n\nconsole.log(value)\n```\n\nAfter'} />)

    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    const code = document.querySelector('pre code')
    if (!code) throw new Error('Expected a rendered code block')

    expect(code.textContent).toBe('const value = "**not bold**"\n\nconsole.log(value)')
    expect(code.closest('pre')).toHaveClass('rich-text-code-display')
    expect(code.closest('strong')).toBeNull()
    expect(code.querySelector('.hljs-keyword')).toHaveTextContent('const')
  })
})
