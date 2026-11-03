import { describe, expect, it } from 'vitest'
import { normaliseRichText, richTextToPlainText } from '@/lib/domain/rich-text'

describe('rich text storage', () => {
  it('keeps formatting for display while producing useful searchable text', () => {
    const value = '# Callback\n\n**Pass** a [function](https://example.com) as a *value*.\n\n> 💡 Reuse it'
    expect(richTextToPlainText(value)).toBe('Callback Pass a function as a value. 💡 Reuse it')
  })

  it('normalises line endings without flattening an author’s structure', () => {
    expect(normaliseRichText('  First\r\n\r\nSecond  ')).toBe('First\n\nSecond')
  })
})
