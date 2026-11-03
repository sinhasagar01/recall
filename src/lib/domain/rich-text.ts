/**
 * The topic columns intentionally remain plain strings. Rich text is stored as a
 * small Markdown subset rather than HTML so it stays safe to render, searchable,
 * exportable, and compatible with every topic already in the library.
 */
export function richTextToPlainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^:::(?:hint|quote)(?:\[[a-z]+\])?$/gm, '')
    .replace(/^:::\s*$/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/\\([\\[\]()*_])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Canonical whitespace without changing the author’s paragraphs or lists. */
export function normaliseRichText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}
