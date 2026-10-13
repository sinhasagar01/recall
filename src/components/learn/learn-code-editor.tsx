'use client'

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const vscodeDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#c586c0' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ce9178' },
  { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#dcdcaa' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.operator, color: '#d4d4d4' },
])

const theme = EditorView.theme({
  '&': { backgroundColor: '#1e1e1e', color: '#d4d4d4', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '18px 18px 18px 8px', lineHeight: '1.75' },
  '.cm-gutters': { backgroundColor: '#1e1e1e', color: '#858585', border: 'none', fontFamily: 'var(--font-mono)', padding: '18px 0 18px 12px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
})

export function LearnCodeEditor({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: code, extensions: [lineNumbers(), javascript({ typescript: true }), syntaxHighlighting(vscodeDark), theme, EditorView.editable.of(false), EditorState.readOnly.of(true)] }) })
    return () => view.destroy()
  }, [code])
  return <div ref={host} aria-label="Syntax highlighted JavaScript example" />
}
