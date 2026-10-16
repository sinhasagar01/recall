import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/ui/wordmark'
import { createClient } from '@/lib/supabase/server'

/**
 * Recall's public front door. A signed-in person already has a working space,
 * so the logo continues to take them straight to Library rather than presenting
 * marketing between them and their learning.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) redirect('/home')

  return (
    <main className="min-h-screen overflow-hidden bg-surface">
      <header className="mx-auto flex h-[76px] max-w-[1220px] items-center justify-between px-5 md:px-10">
        <Link href="/" aria-label="Recall home" className="rounded-sm">
          <Wordmark size="lg" />
        </Link>
        <nav className="flex items-center gap-4 text-option" aria-label="Public navigation">
          <Link href="/sign-in" className="hidden rounded-sm text-ink hover:text-accent-ink sm:block">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex min-h-10 items-center rounded-md bg-accent px-3.5 py-2 text-label font-medium text-white shadow-card hover:bg-accent-ink"
          >
            Start learning
          </Link>
        </nav>
      </header>

      <section className="border-y border-rule bg-surface-2">
        <div className="mx-auto grid max-w-[1220px] items-center gap-11 px-5 py-16 md:grid-cols-[minmax(0,1.02fr)_minmax(390px,.98fr)] md:px-10 md:py-22">
          <div>
            <p className="font-mono text-mono-md font-medium tracking-[0.14em] text-accent uppercase">
              Learn it. Use it. Keep it.
            </p>
            <h1 className="mt-4 max-w-[650px] font-display text-[48px] leading-[1.04] font-semibold tracking-[-0.045em] text-ink md:text-[66px]">
              Turn what you watch into knowledge you can use.
            </h1>
            <p className="mt-5 max-w-[540px] text-[18px] leading-[1.6] text-ink-2">
              Recall turns a transcript, course, or rough note into a focused lesson—then helps you practise it until it sticks.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/sign-up"
                className="inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-register font-medium text-white shadow-pop hover:bg-accent-ink"
              >
                Create your first lesson&nbsp; →
              </Link>
              <Link href="/sign-in" className="rounded-sm text-option text-accent-ink hover:text-ink">
                I already have an account
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-mono-md text-ink-3">
              <span className="flex items-center gap-2"><i className="size-1.5 rounded-full bg-ok" />Your learning stays private</span>
              <span className="flex items-center gap-2"><i className="size-1.5 rounded-full bg-ok" />Start with one idea</span>
            </div>
          </div>

          <div className="rotate-[1deg] rounded-lg border border-rule-strong bg-surface-3 p-3 shadow-pop">
            <div className="overflow-hidden rounded-md border border-rule bg-surface">
              <div className="flex h-10 items-center gap-1 border-b border-rule px-3" aria-hidden="true">
                <i className="size-1.5 rounded-full bg-rule-strong" /><i className="size-1.5 rounded-full bg-rule-strong" /><i className="size-1.5 rounded-full bg-rule-strong" />
              </div>
              <div className="grid min-h-[314px] grid-cols-[86px_1fr]">
                <aside className="bg-ink px-2.5 py-4 font-mono text-[9px] text-accent-soft" aria-hidden="true">
                  <b className="mb-5 block font-display text-[14px] text-white">recall</b>
                  <span className="mb-3 block opacity-75">Library</span><span className="mb-3 block opacity-75">Practice</span><span className="mb-3 block rounded-sm bg-accent-ink px-2 py-1.5 text-white">Learn</span><span className="block opacity-75">Sources</span>
                </aside>
                <div className="p-6">
                  <p className="font-mono text-mono-xs font-medium tracking-[0.12em] text-accent uppercase">Guided lesson · 3 minutes</p>
                  <h2 className="mt-2 font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.03em]">Callbacks, clearly.</h2>
                  <p className="mt-1.5 text-meta text-ink-2">Read it once. Then prove you can use it.</p>
                  <div className="mt-5 rounded-md border border-rule p-3.5">
                    <strong className="text-label font-medium">Pass a function into another function</strong>
                    <pre className="mt-2.5 overflow-hidden rounded-sm bg-ink p-3 font-mono text-[9px] leading-[1.7] text-accent-soft"><span className="text-flag-soft">function</span> <span className="text-accent-soft">copyArray</span>(items, instruction) {'{'}{`\n`}  <span className="text-flag-soft">return</span> items.<span className="text-accent-soft">map</span>(instruction){`\n`}{'}'}</pre>
                    <div className="mt-3 flex gap-1" aria-label="Lesson progress"><i className="h-1 w-7 rounded-full bg-accent" /><i className="h-1 w-7 rounded-full bg-accent" /><i className="h-1 w-7 rounded-full bg-accent" /><i className="h-1 w-7 rounded-full bg-rule" /><i className="h-1 w-7 rounded-full bg-rule" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1220px] px-5 py-16 md:px-10 md:py-22">
        <p className="font-mono text-mono-md font-medium tracking-[0.14em] text-accent uppercase">A practice loop, not a note graveyard</p>
        <h2 className="mt-3 max-w-[720px] font-display text-[42px] leading-[1.08] font-semibold tracking-[-0.04em] md:text-[56px]">Give every useful idea a way to come back.</h2>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['1', 'Distil', 'Paste a transcript or note. Keep only the idea worth learning.'],
            ['2', 'Understand', 'Read a clean explanation with code and examples that have room to breathe.'],
            ['3', 'Recall', 'Answer without looking. See exactly what needs another pass.'],
            ['4', 'Keep it', 'Add compact prompts to your review rhythm for later.'],
          ].map(([number, title, body]) => (
            <article key={number} className="min-h-[190px] rounded-lg border border-rule bg-surface p-5 shadow-card">
              <span className="grid size-7 place-items-center rounded-full bg-accent-soft font-mono text-mono-sm text-accent-ink">{number}</span>
              <h3 className="mt-7 font-display text-card-title font-semibold tracking-[-0.025em]">{title}</h3>
              <p className="mt-2 text-option leading-[1.5] text-ink-2">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-5 mb-8 rounded-lg bg-ink px-6 py-7 text-white md:mx-auto md:mb-10 md:flex md:max-w-[1140px] md:items-center md:justify-between md:px-8">
        <div>
          <h2 className="font-display text-[27px] font-semibold tracking-[-0.03em]">One useful idea is enough to begin.</h2>
          <p className="mt-1 text-option text-surface-3">Start with a video transcript, an article, or your own notes.</p>
        </div>
        <Link href="/sign-up" className="mt-5 inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-label font-medium text-white hover:bg-accent-ink md:mt-0">
          Make a lesson&nbsp; →
        </Link>
      </section>
    </main>
  )
}
