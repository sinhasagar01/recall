import { Fragment, type ReactNode } from 'react'

type Props = { value: string; className?: string }
const HINT_ICONS = { info: 'ⓘ', smile: '☻', check: '✓', alert: '!', cross: '×' } as const
type HintIcon = keyof typeof HINT_ICONS

/** Renders Recall's safe Markdown subset as React nodes — never raw HTML. */
export function RichTextContent({ value, className }: Props) {
  const blocks = value.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const callout = /^:::(hint|quote)(?:\[([a-z]+)\])?\n([\s\S]*?)\n?:::$/.exec(block)
        if (callout) {
          if (callout[1] === 'hint') {
            const icon = hintIcon(callout[2])
            return <aside key={index} className="rich-text-hint-display" data-icon={icon}><span aria-hidden="true" className="rich-text-hint-display-icon">{HINT_ICONS[icon]}</span><p>{inline(callout[3])}</p></aside>
          }
          return <blockquote key={index} className="rich-text-quote-display">{callout[3].split('\n').map((line, item) => <Fragment key={item}>{item > 0 ? <br /> : null}{inline(line)}</Fragment>)}</blockquote>
        }
        const heading = /^(#{1,3})\s+([\s\S]*)$/.exec(block)
        if (heading) {
          const Tag = `h${heading[1].length}` as 'h1' | 'h2' | 'h3'
          const style = heading[1].length === 1 ? 'text-[27px]' : heading[1].length === 2 ? 'text-[22px]' : 'text-[18px]'
          return <Tag key={index} className={`font-display font-semibold leading-[1.2] ${style}`}>{inline(heading[2])}</Tag>
        }
        const lines = block.split('\n')
        if (lines.every((line) => /^>\s?/.test(line))) {
          const quote = lines.map((line) => line.replace(/^>\s?/, '')).join('\n')
          const hint = quote.startsWith('💡 ')
          const text = hint ? quote.slice(3) : quote
          return hint
            ? <aside key={index} className="rich-text-hint-display" data-icon="info"><span aria-hidden="true" className="rich-text-hint-display-icon">{HINT_ICONS.info}</span><p>{inline(text)}</p></aside>
            : <blockquote key={index} className="rich-text-quote-display">{lines.map((line, item) => <Fragment key={item}>{item > 0 ? <br /> : null}{inline(line.replace(/^>\s?/, ''))}</Fragment>)}</blockquote>
        }
        if (lines.every((line) => /^\d+\.\s+/.test(line))) return <ol key={index} className="list-decimal space-y-1 pl-6">{lines.map((line, item) => <li key={item}>{inline(line.replace(/^\d+\.\s+/, ''))}</li>)}</ol>
        if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index} className="list-disc space-y-1 pl-6">{lines.map((line, item) => <li key={item}>{inline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>
        return <p key={index}>{lines.map((line, item) => <Fragment key={item}>{item > 0 ? <br /> : null}{inline(line)}</Fragment>)}</p>
      })}
    </div>
  )
}

function hintIcon(value: string | undefined): HintIcon { return value && value in HINT_ICONS ? value as HintIcon : 'info' }

function inline(value: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const matcher = /\[([^\]]+)\]\((https?:[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let cursor = 0
  for (const match of value.matchAll(matcher)) {
    if (match.index! > cursor) nodes.push(value.slice(cursor, match.index))
    const key = match.index!
    if (match[1] && match[2]) nodes.push(<a key={key} href={match[2]} className="text-accent-ink underline underline-offset-2" rel="noreferrer" target={match[2].startsWith('http') ? '_blank' : undefined}>{match[1]}</a>)
    else if (match[3]) nodes.push(<strong key={key} className="font-semibold">{match[3]}</strong>)
    else if (match[4]) nodes.push(<em key={key}>{match[4]}</em>)
    cursor = key + match[0].length
  }
  if (cursor < value.length) nodes.push(value.slice(cursor))
  return nodes
}
