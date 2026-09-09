'use client'

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * The DSA round's editor. Nothing smarter than a whiteboard.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * No autocomplete, no type checking, no linting, no bracket-closing. An
 * interview editor that helps you is not testing you — and every one of those is
 * an opt-in extension here, so their absence is the default rather than
 * something switched off.
 *
 * **Nothing is executed.** No runner, no test harness, no sandbox, not stubbed
 * and not behind a flag. The model reads the code as text, the way an
 * interviewer reads a whiteboard.
 *
 * ── Highlighting is the one thing it does ───────────────────────────────────
 * Because unhighlighted code in a serif-adjacent page reads as prose, and the
 * point of the editor is that this is a different kind of writing. The theme is
 * built from the interview scale, inside the interview tree, so no token leaves
 * it — `interview-boundary.test.ts` allows the scale to be named here and the
 * dependency changes nothing about that.
 *
 * ── A placeholder comment, not an overlay ───────────────────────────────────
 * The reference is explicit: an overlay is one more thing to dismiss.
 */
const HIGHLIGHT = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--volt-ink)' },
  { tag: [tags.string, tags.number, tags.bool], color: 'var(--mint-ink)' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.propertyName], color: 'var(--gold-ink)' },
  { tag: tags.typeName, color: 'var(--teal)' },
])

const THEME = EditorView.theme({
  '&': { fontSize: '12.5px', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-1px' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '14px 16px 14px 12px' },
  '.cm-line': { lineHeight: '1.8' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface)',
    border: 'none',
    color: 'var(--rule-strong)',
    fontFamily: 'var(--font-mono)',
    padding: '14px 0 14px 14px',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'var(--ink-3)', fontStyle: 'normal' },
})

export function CodeEditor({
  value,
  onChange,
  label = 'Your solution',
}: {
  value: string
  onChange: (next: string) => void
  label?: string
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  /* The callback changes every render; the view is built once. */
  const emit = useRef(onChange)
  emit.current = onChange

  useEffect(() => {
    if (host.current === null) return

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript({ typescript: true }),
          syntaxHighlighting(HIGHLIGHT),
          THEME,
          placeholder('// write your solution here'),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) emit.current(update.state.doc.toString())
          }),
          /*
            The room owns ⌘↵. CodeMirror's own keymap does not bind it, and the
            document listener that sends the answer is above this in the tree —
            so the chord works from inside the editor exactly as it works from
            inside the textarea, which is the point of it existing.
          */
          EditorView.contentAttributes.of({ 'aria-label': label, 'data-testid': 'code-editor' }),
        ],
      }),
    })

    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // Built once. `value` is read only for the initial document; see below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    One-way after mount: the room is the owner of the text, but pushing every
    keystroke back in would fight the cursor. This only reconciles when the two
    have genuinely diverged — which in practice is the reset on `Next problem`.
  */
  useEffect(() => {
    const editor = view.current
    if (editor === null) return
    const current = editor.state.doc.toString()
    if (current === value) return
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return (
    <div className="mt-3.5 overflow-hidden rounded-[14px] border border-rule-strong bg-surface shadow-[0_2px_12px_rgba(18,19,26,0.06)]">
      <div className="flex items-center gap-2.5 border-b border-rule bg-surface-2 px-3.5 py-[9px] font-mono text-[11px] text-ink-3">
        <span>solution.ts</span>
        <span className="ml-auto" data-testid="editor-note">
          CodeMirror 6 · TypeScript · no autocomplete, no type checking, nothing runs
        </span>
      </div>
      <div ref={host} data-testid="code-editor-host" />
    </div>
  )
}
