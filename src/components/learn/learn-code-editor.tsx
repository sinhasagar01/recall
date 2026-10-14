'use client'

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const githubDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  { tag: [tags.string, tags.special(tags.string)], color: '#a5d6ff' },
  { tag: [tags.number, tags.bool, tags.null], color: '#79c0ff' },
  { tag: tags.comment, color: '#8b949e', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#d2a8ff' },
  { tag: tags.variableName, color: '#c9d1d9' },
  { tag: tags.operator, color: '#ff7b72' },
])

const theme = EditorView.theme({
  '&': { backgroundColor: '#0d1117', color: '#c9d1d9', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '18px 18px 18px 8px', lineHeight: '1.75' },
  '.cm-gutters': { backgroundColor: '#0d1117', color: '#6e7681', border: 'none', fontFamily: 'var(--font-mono)', padding: '18px 0 18px 12px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
})

function languageExtension(language: string | null) {
  switch (language) {
    case 'HTML': return html()
    case 'CSS': return css()
    case 'JSON': return json()
    case 'Python': return python()
    default: return javascript({ typescript: language === 'TypeScript' })
  }
}

export function LearnCodeEditor({ code, language = 'JavaScript' }: { code: string; language?: string | null }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: code, extensions: [lineNumbers(), languageExtension(language), syntaxHighlighting(githubDark), theme, EditorView.editable.of(false), EditorState.readOnly.of(true)] }) })
    return () => view.destroy()
  }, [code, language])
  return <div ref={host} aria-label={`Syntax highlighted ${language ?? 'code'} example`} />
}
