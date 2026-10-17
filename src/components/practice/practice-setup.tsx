'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { LinkButton } from '@/components/ui/link-button'
import { Select, type SelectOption } from '@/components/ui/select'
import type { Kind } from '@/lib/domain/types'

export type PracticeCategoryOption = SelectOption & { needsPractice: number }

/**
 * The second, deliberate choice after a learner chooses topics or quizzes.
 * Keeping it client-side makes the changing count and start link immediate,
 * while the session itself remains server-built from the final URL.
 */
export function PracticeSetup({
  kind,
  total,
  needsPractice,
  categories,
}: {
  kind: Kind
  total: number
  needsPractice: number
  categories: PracticeCategoryOption[]
}) {
  const [focus, setFocus] = useState<'all' | 'needs-practice'>('all')
  const [category, setCategory] = useState('all')

  const kindLabel = kind === 'topic' ? 'topics' : 'quizzes'
  const selectedCategory = categories.find((option) => option.value === category) ?? categories[0]
  const count = focus === 'needs-practice' ? selectedCategory.needsPractice : selectedCategory.count ?? 0
  const href = useMemo(() => {
    const params = new URLSearchParams({ scope: kind, focus })
    if (category !== 'all') params.set('category', category)
    return `/practice?${params.toString()}`
  }, [category, focus, kind])

  const reviewCopy = `Practice ${needsPractice} ${kindLabel} that you marked weak or have not practised yet.`

  return (
    <section className="max-w-[820px]">
      <header className="mb-7 border-b border-rule pb-5">
      <LinkButton href="/practice" className="mb-5">
        ← Back to practice types
      </LinkButton>
      <p className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Practice setup</p>
      <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-medium tracking-[-0.025em]">
        Set up your {kind === 'topic' ? 'topic' : 'quiz'} practice
      </h1>
      <p className="mt-2 max-w-[58ch] text-body leading-[1.6] text-ink-2">
        Choose the material you want to work through. Topics and quizzes always stay separate.
      </p>
      </header>

      <div className="rounded-lg border border-rule bg-surface p-6 shadow-card">
        <fieldset>
          <legend className="font-display text-card-title font-medium">What should this session focus on?</legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={focus === 'all'}
              onClick={() => setFocus('all')}
              className={`min-h-[148px] rounded-lg border p-5 text-left transition-colors ${
                focus === 'all'
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
              }`}
            >
              <span className="block font-medium">Practice all {kindLabel}</span>
              <span className="mt-1 block text-meta leading-[1.55] text-ink-2">
                Cover all {total} in this part of your library.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={focus === 'needs-practice'}
              onClick={() => setFocus('needs-practice')}
              className={`min-h-[148px] rounded-lg border p-5 text-left transition-colors ${
                focus === 'needs-practice'
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
              }`}
            >
              <span className="block font-medium">Focus on what needs practice</span>
              <span className="mt-1 block text-meta leading-[1.55] text-ink-2">{reviewCopy}</span>
            </button>
          </div>
        </fieldset>

        <div className="mt-6 border-t border-rule pt-5">
          <p className="font-display text-card-title font-medium">
            Narrow by category <span className="font-sans text-body font-normal text-ink-3">(optional)</span>
          </p>
          <p className="mt-1 text-meta leading-[1.55] text-ink-2">
            Leave this on all categories to include your full {kindLabel} library.
          </p>
          <div className="mt-3 max-w-sm">
            <Select
              label="Category"
              options={categories}
              value={category}
              unsetValue="all"
              onChange={setCategory}
              filterable
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          <p className="text-meta text-ink-2" aria-live="polite">
            <span className="font-medium text-ink">{count}</span> {count === 1 ? kind.slice(0, -1) : kindLabel} ready
            {category !== 'all' ? ` in ${selectedCategory.label}` : ''}.
          </p>
          {count > 0 ? (
            <Link
              href={href}
              className="inline-flex min-h-11 items-center rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              Start practice
            </Link>
          ) : (
            <p className="text-meta text-ink-3">Nothing matches this setup yet.</p>
          )}
        </div>
      </div>
    </section>
  )
}
