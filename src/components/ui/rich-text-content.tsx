import { Fragment, type ReactNode } from 'react'

type Props = { value: string; className?: string }

/** Renders Recall's safe Markdown subset as React nodes — never raw HTML. */
export function RichTextContent({ value, className }: Props) {
  const blocks = value.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
  return (
    <div className={className}>
      {blocks.map((block, index) => {
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
            ? <aside key={index} className="rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-ink"><p className="mb-1 font-mono text-mono-sm font-semibold tracking-[0.08em] text-accent-ink uppercase">Hint</p><p>{inline(text)}</p></aside>
            : <blockquote key={index} className="border-l-2 border-rule-strong pl-4 italic text-ink-2">{lines.map((line, item) => <Fragment key={item}>{item > 0 ? <br /> : null}{inline(line.replace(/^>\s?/, ''))}</Fragment>)}</blockquote>
        }
        if (lines.every((line) => /^\d+\.\s+/.test(line))) return <ol key={index} className="list-decimal space-y-1 pl-6">{lines.map((line, item) => <li key={item}>{inline(line.replace(/^\d+\.\s+/, ''))}</li>)}</ol>
        if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index} className="list-disc space-y-1 pl-6">{lines.map((line, item) => <li key={item}>{inline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>
        return <p key={index}>{lines.map((line, item) => <Fragment key={item}>{item > 0 ? <br /> : null}{inline(line)}</Fragment>)}</p>
      })}
    </div>
  )
}

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
