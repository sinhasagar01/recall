import Link from 'next/link'
import { BackToLibrary } from '@/components/ui/back-to-library'

/**
 * The practice destination begins with a choice rather than silently composing
 * unlike retrieval modes into one queue. These are navigation links (not ARIA
 * tabs): choosing a type loads a different server-built session.
 */
export function PracticeTypeTabs() {
  return (
    <section className="max-w-[680px]">
      <BackToLibrary className="mb-6">← Back to library</BackToLibrary>
      <p className="font-mono text-[11.5px] tracking-[0.12em] text-ink-3 uppercase">Practice</p>
      <h1 className="mt-2 font-display text-page-title font-medium tracking-[-0.022em]">
        Choose a practice type
      </h1>
      <p className="mt-2 max-w-[54ch] text-body leading-[1.6] text-ink-2">
        Topics ask you to explain an idea from memory. Quizzes ask you to choose the answer.
      </p>

      <nav aria-label="Practice type" className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href="/practice?scope=topic"
          className="rounded-lg border border-rule-strong bg-surface p-5 shadow-card hover:border-ink-3"
        >
          <span className="font-display text-card-title font-medium">Practice topics</span>
          <span className="mt-2 block text-meta leading-[1.55] text-ink-2">
            Recall the definition and explain it in your own words.
          </span>
        </Link>
        <Link
          href="/practice?scope=quiz"
          className="rounded-lg border border-rule-strong bg-surface p-5 shadow-card hover:border-ink-3"
        >
          <span className="font-display text-card-title font-medium">Practice quizzes</span>
          <span className="mt-2 block text-meta leading-[1.55] text-ink-2">
            Answer your saved questions and see whether you were right.
          </span>
        </Link>
      </nav>
    </section>
  )
}
