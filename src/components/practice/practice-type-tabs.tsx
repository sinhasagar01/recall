import Link from 'next/link'
import { BackToLibrary } from '@/components/ui/back-to-library'

/**
 * The practice destination begins with a choice rather than silently composing
 * unlike retrieval modes into one queue. These are navigation links (not ARIA
 * tabs): choosing a type loads a different server-built session.
 */
export function PracticeTypeTabs() {
  return (
    <section className="max-w-[820px]">
      <header className="mb-7 border-b border-rule pb-5">
        <BackToLibrary className="mb-5">← Back to library</BackToLibrary>
        <p className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Practice</p>
        <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-medium tracking-[-0.025em]">
        Choose a practice type
        </h1>
        <p className="mt-2 max-w-[54ch] text-body leading-[1.6] text-ink-2">
        Topics ask you to explain an idea from memory. Quizzes ask you to choose the answer.
        </p>
      </header>

      <nav aria-label="Practice type" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/practice?scope=topic"
          className="group min-h-[190px] rounded-lg border border-rule bg-surface p-6 shadow-card transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-accent hover:shadow-pop"
        >
          <span className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Free recall</span>
          <span className="mt-4 block font-display text-[25px] leading-[1.15] font-medium">Practice topics</span>
          <span className="mt-2 block text-meta leading-[1.55] text-ink-2">
            Recall the definition and explain it in your own words.
          </span>
        </Link>
        <Link
          href="/practice?scope=quiz"
          className="group min-h-[190px] rounded-lg border border-rule bg-surface p-6 shadow-card transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-accent hover:shadow-pop"
        >
          <span className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Quick check</span>
          <span className="mt-4 block font-display text-[25px] leading-[1.15] font-medium">Practice quizzes</span>
          <span className="mt-2 block text-meta leading-[1.55] text-ink-2">
            Answer your saved questions and see whether you were right.
          </span>
        </Link>
      </nav>
    </section>
  )
}
