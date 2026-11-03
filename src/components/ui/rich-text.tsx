'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { mergeAttributes, Node as TiptapNode, type Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'

type Props = { id: string; name: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; ariaLabel: string }
type CommandId = 'text' | 'heading-1' | 'heading-2' | 'heading-3' | 'ordered-list' | 'bullet-list' | 'bold' | 'italic' | 'hint' | 'quote'
type CommandOption = { id: CommandId; label: string; hint: string }
type SlashMenu = { query: string; top: number; left: number; from: number; to: number }
type HintIcon = keyof typeof HINT_ICONS

const HINT_ICONS = {
  info: 'ⓘ',
  smile: '☻',
  check: '✓',
  alert: '!',
  cross: '×',
} as const

const Hint = TiptapNode.create({
  name: 'hint',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      icon: {
        default: 'info',
        parseHTML: (element) => hintIcon(element.getAttribute('data-icon')),
        renderHTML: (attributes) => ({ 'data-icon': hintIcon(attributes.icon) }),
      },
    }
  },
  parseHTML() { return [{ tag: 'aside[data-rich-text-hint]' }] },
  renderHTML({ HTMLAttributes }) { return ['aside', mergeAttributes({ 'data-rich-text-hint': 'true', class: 'rich-text-hint' }, HTMLAttributes), 0] },
})

const COMMAND_OPTIONS: readonly CommandOption[] = [
  { id: 'text', label: 'Text', hint: 'Start writing normally' },
  { id: 'heading-1', label: 'Heading 1', hint: 'A major idea or section' },
  { id: 'heading-2', label: 'Heading 2', hint: 'A supporting section' },
  { id: 'heading-3', label: 'Heading 3', hint: 'A smaller heading' },
  { id: 'ordered-list', label: 'Numbered list', hint: 'Steps in order' },
  { id: 'bullet-list', label: 'Bulleted list', hint: 'Related points' },
  { id: 'bold', label: 'Bold', hint: 'Emphasize the next words' },
  { id: 'italic', label: 'Italic', hint: 'Add nuance or emphasis' },
  { id: 'hint', label: 'Hint', hint: 'A helpful memory cue' },
  { id: 'quote', label: 'Quote', hint: 'A quoted idea or source' },
]

/** A real ProseMirror editor, with Recall’s compact slash-command product layer. */
export function RichTextEditor({ id, name, value, onChange, required = false, placeholder, ariaLabel }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef(value)
  const [slashMenu, setSlashMenu] = useState<SlashMenu | null>(null)
  const [activeSlashIndex, setActiveSlashIndex] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [, redraw] = useState(0)

  const refreshSlash = useCallback((current: Editor) => {
    const { $from, from } = current.state.selection
    const before = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0')
    const match = /^\/([\w\s-]*)$/.exec(before)
    if (!match || !rootRef.current) { setSlashMenu(null); return }
    let cursor: { left: number; bottom: number }
    try {
      cursor = current.view.coordsAtPos(from)
    } catch {
      // jsdom has no layout engine; the browser path above supplies the real caret.
      cursor = { left: 12, bottom: 24 }
    }
    const root = rootRef.current.getBoundingClientRect()
    setSlashMenu({ query: match[1], from: from - match[0].length, to: from, left: Math.max(12, cursor.left - root.left), top: cursor.bottom - root.top + 8 })
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      Hint,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write here…' }),
    ],
    content: markdownToEditorHtml(value),
    editorProps: { attributes: { id, 'aria-label': ariaLabel, 'aria-required': required ? 'true' : 'false' } },
    onUpdate: ({ editor: current }) => {
      const next = htmlToMarkdown(current.getHTML())
      lastValueRef.current = next
      onChange(next)
      refreshSlash(current)
      redraw((count) => count + 1)
    },
    onSelectionUpdate: ({ editor: current }) => { refreshSlash(current); redraw((count) => count + 1) },
  })

  useEffect(() => {
    if (!editor || value === lastValueRef.current) return
    editor.commands.setContent(markdownToEditorHtml(value), { emitUpdate: false })
    lastValueRef.current = value
  }, [editor, value])

  const applyCommand = (option: CommandOption) => {
    if (!editor || !slashMenu) return
    let chain = editor.chain().focus().deleteRange({ from: slashMenu.from, to: slashMenu.to })
    if (option.id === 'text') chain = chain.setParagraph()
    if (option.id === 'heading-1') chain = chain.setHeading({ level: 1 })
    if (option.id === 'heading-2') chain = chain.setHeading({ level: 2 })
    if (option.id === 'heading-3') chain = chain.setHeading({ level: 3 })
    if (option.id === 'ordered-list') chain = chain.toggleOrderedList()
    if (option.id === 'bullet-list') chain = chain.toggleBulletList()
    if (option.id === 'bold') chain = chain.toggleBold()
    if (option.id === 'italic') chain = chain.toggleItalic()
    if (option.id === 'hint') chain = chain.setNode('hint', { icon: 'info' })
    if (option.id === 'quote') chain = chain.toggleBlockquote()
    chain.run()
    setSlashMenu(null)
  }

  const openLink = () => {
    if (!editor || editor.state.selection.empty) return
    setLinkValue(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }
  const saveLink = () => {
    if (!editor) return
    const href = linkValue.trim()
    if (href === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: /^(https?:|mailto:)/i.test(href) ? href : `https://${href}` }).run()
    setLinkOpen(false)
  }
  const changeHintIcon = (icon: HintIcon) => {
    editor?.chain().focus().updateAttributes('hint', { icon }).run()
    setIconPickerOpen(false)
  }
  const options = slashMenu ? COMMAND_OPTIONS.filter((option) => option.label.toLowerCase().includes(slashMenu.query.toLowerCase())) : []

  const handleSlashKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!slashMenu || options.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSlashIndex((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSlashIndex((index) => (index - 1 + options.length) % options.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      applyCommand(options[Math.min(activeSlashIndex, options.length - 1)] ?? options[0])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSlashMenu(null)
    }
  }

  return (
    <div ref={rootRef} onKeyDownCapture={handleSlashKeys} className="rich-text-editor relative overflow-visible rounded-md border border-rule-strong bg-surface focus-within:border-accent focus-within:outline-2 focus-within:outline-accent">
      <input type="hidden" name={name} value={value} />
      <EditorContent editor={editor} />
      {slashMenu ? (
        <div role="menu" aria-label="Formatting options" style={{ left: slashMenu.left, top: slashMenu.top }} className="absolute z-40 w-64 overflow-hidden rounded-lg border border-rule-strong bg-surface py-1 shadow-pop">
          <p className="px-4 pt-2 pb-1 font-mono text-mono-sm tracking-[0.1em] text-ink-3 uppercase">Turn into</p>
          {options.length ? options.map((option, index) => <button key={option.id} id={`slash-option-${option.id}`} type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand(option)} className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left focus-visible:outline-none ${index === Math.min(activeSlashIndex, options.length - 1) ? 'bg-surface-2' : 'hover:bg-surface-2'}`}><span className="text-body text-ink">{option.label}</span><span className="text-meta text-ink-3">{option.hint}</span></button>) : <p className="px-4 py-2.5 text-meta text-ink-3">No matching format</p>}
        </div>
      ) : null}
      <div className="flex min-h-11 items-center justify-between gap-3 border-t border-rule bg-surface-2 px-2 py-1.5">
        <p className="hidden font-mono text-mono-sm text-ink-3 md:block">Type <kbd className="rounded border border-rule-strong bg-surface px-1 py-0.5">/</kbd> for blocks</p>
        <div className="relative ml-auto flex items-center gap-1">
          <ToolbarButton label="Bold" active={editor?.isActive('bold') ?? false} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
          <ToolbarButton label="Italic" active={editor?.isActive('italic') ?? false} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
          {editor?.isActive('hint') ? <div className="relative"><ToolbarButton label="Change hint icon" active={iconPickerOpen} onClick={() => setIconPickerOpen((open) => !open)}>{HINT_ICONS[hintIcon(editor.getAttributes('hint').icon)]}</ToolbarButton>{iconPickerOpen ? <div role="menu" aria-label="Hint icon" className="absolute right-0 bottom-[calc(100%+8px)] z-40 flex gap-1 rounded-lg border border-rule-strong bg-surface p-1.5 shadow-pop">{(Object.keys(HINT_ICONS) as HintIcon[]).map((icon) => <button key={icon} type="button" role="menuitemradio" aria-checked={hintIcon(editor.getAttributes('hint').icon) === icon} aria-label={`Use ${icon} hint icon`} onMouseDown={(event) => event.preventDefault()} onClick={() => changeHintIcon(icon)} className={`grid size-9 place-items-center rounded-md text-lg focus-visible:outline-2 focus-visible:outline-accent ${hintIcon(editor.getAttributes('hint').icon) === icon ? 'bg-accent text-accent-foreground' : 'text-ink-2 hover:bg-surface-2'}`}>{HINT_ICONS[icon]}</button>)}</div> : null}</div> : null}
          <ToolbarButton label="Add link" active={editor?.isActive('link') ?? false} disabled={!editor || editor.state.selection.empty} onClick={openLink}>↗</ToolbarButton>
          {linkOpen ? <div role="dialog" aria-label="Add link" className="absolute right-0 bottom-[calc(100%+8px)] z-40 flex w-[290px] gap-2 rounded-lg border border-rule-strong bg-surface p-2 shadow-pop"><input autoFocus value={linkValue} onChange={(event) => setLinkValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveLink() } if (event.key === 'Escape') { event.preventDefault(); setLinkOpen(false) } }} placeholder="https://example.com" className="min-w-0 flex-1 rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-meta text-ink outline-none focus:border-accent" /><button type="button" onClick={saveLink} className="rounded-md bg-accent px-2.5 py-1.5 text-meta font-medium text-accent-foreground">Apply</button></div> : null}
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ label, active, disabled = false, onClick, children }: { label: string; active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={disabled ? 'Select text first' : label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={`grid size-8 place-items-center rounded-md text-[18px] transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-accent text-accent-foreground' : 'text-ink-2 hover:bg-surface hover:text-ink'}`}>{children}</button>
}

function htmlToMarkdown(html: string): string { const root = document.createElement('div'); root.innerHTML = html; return editorHtmlToMarkdown(root) }
function editorHtmlToMarkdown(root: HTMLElement): string {
  const convert = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as HTMLElement; const text = Array.from(element.childNodes).map(convert).join('')
    switch (element.tagName.toLowerCase()) {
      case 'strong': case 'b': return `**${text}**`
      case 'em': case 'i': return `*${text}*`
      case 'a': { const href = element.getAttribute('href') ?? ''; return /^(https?:|mailto:)/i.test(href) ? `[${text}](${href})` : text }
      case 'br': return '\n'; case 'h1': return `# ${text}\n\n`; case 'h2': return `## ${text}\n\n`; case 'h3': return `### ${text}\n\n`
      case 'li': return text
      case 'ul': return Array.from(element.children).map((child) => `- ${convert(child).trim()}`).join('\n') + '\n\n'
      case 'ol': return Array.from(element.children).map((child, index) => `${index + 1}. ${convert(child).trim()}`).join('\n') + '\n\n'
      case 'aside': return element.hasAttribute('data-rich-text-hint') ? `:::hint[${hintIcon(element.getAttribute('data-icon'))}]\n${text.trim()}\n:::\n\n` : text
      case 'blockquote': return `:::quote\n${text.trim()}\n:::\n\n`
      case 'div': case 'p': return `${text}\n\n`
      default: return text
    }
  }
  return Array.from(root.childNodes).map(convert).join('').replace(/\n{3,}/g, '\n\n').trim()
}
function markdownToEditorHtml(value: string): string {
  const blocks: string[] = []; const lines = value.replace(/\r\n?/g, '\n').split('\n'); let index = 0
  while (index < lines.length) {
    const line = lines[index]; if (line.trim() === '') { index += 1; continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) { const level = heading[1].length; blocks.push(`<h${level}>${inlineToHtml(heading[2])}</h${level}>`); index += 1; continue }
    const callout = /^:::(hint|quote)(?:\[([a-z]+)\])?$/.exec(line)
    if (callout) { const content: string[] = []; index += 1; while (index < lines.length && lines[index] !== ':::') { content.push(lines[index]); index += 1 }; if (lines[index] === ':::') index += 1; const body = inlineToHtml(content.join('\n')).replace(/\n/g, '<br>'); blocks.push(callout[1] === 'hint' ? `<aside data-rich-text-hint="true" data-icon="${hintIcon(callout[2])}">${body}</aside>` : `<blockquote><p>${body}</p></blockquote>`); continue }
    if (/^>\s?/.test(line)) { const quote: string[] = []; while (index < lines.length && /^>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^>\s?/, '')); index += 1 }; blocks.push(`<blockquote><p>${inlineToHtml(quote.join('\n')).replace(/\n/g, '<br>')}</p></blockquote>`); continue }
    const list = /^(?:[-*]\s+|\d+\.\s+)/.test(line)
    if (list) { const ordered = /^\d+\.\s+/.test(line); const items: string[] = []; while (index < lines.length && (ordered ? /^\d+\.\s+/.test(lines[index]) : /^[-*]\s+/.test(lines[index]))) { items.push(`<li>${inlineToHtml(lines[index].replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''))}</li>`); index += 1 }; blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`); continue }
    const paragraph: string[] = [line]; index += 1; while (index < lines.length && lines[index].trim() !== '' && !/^(#{1,3}\s+|[-*]\s+|\d+\.\s+|:::)/.test(lines[index])) { paragraph.push(lines[index]); index += 1 }; blocks.push(`<p>${inlineToHtml(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`)
  }
  return blocks.join('')
}
function inlineToHtml(value: string): string { const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return escaped.replace(/\[([^\]]+)\]\((https?:[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>') }
function hintIcon(value: unknown): HintIcon { return typeof value === 'string' && value in HINT_ICONS ? value as HintIcon : 'info' }
