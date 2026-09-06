/**
 * The mark that says "this is a question, not a definition".
 *
 * One component rather than a span repeated per surface, because it appears on
 * the library card, the practice header and the detail page, and a badge that
 * looked slightly different in three places would read as three different things.
 *
 * Accent rather than the answer green: it names the shape, not an outcome.
 */
export function QuizBadge() {
  return (
    <span className="shrink-0 rounded-[3px] border border-accent bg-accent-soft px-[7px] py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-accent-ink uppercase">
      Quiz
    </span>
  )
}
