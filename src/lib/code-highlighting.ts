import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'

/**
 * Shared, intentionally small highlighter for rich-text code blocks. Keeping
 * one grammar here means topic forms do not pull every language into the app.
 */
export const codeHighlighter = createLowlight({ javascript })

codeHighlighter.registerAlias('javascript', ['js', 'jsx', 'mjs', 'cjs'])

export function supportedCodeLanguage(value: string): string {
  return codeHighlighter.registered(value) ? value : 'javascript'
}
