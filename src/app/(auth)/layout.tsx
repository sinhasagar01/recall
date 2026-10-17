import Link from 'next/link'
import { Wordmark } from '@/components/ui/wordmark'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="grid min-h-screen bg-bg md:grid-cols-[minmax(320px,.88fr)_minmax(480px,1.12fr)]">
      <section className="relative hidden overflow-hidden bg-ink px-10 py-10 text-white md:flex md:flex-col">
        <Link href="/" aria-label="Recall home" className="w-fit rounded-sm"><Wordmark /></Link>
        <div className="my-auto max-w-[460px]">
          <p className="font-mono text-mono-sm tracking-[.15em] text-accent-soft uppercase">A private learning workspace</p>
          <h1 className="mt-4 font-display text-[52px] leading-[1.02] font-semibold tracking-[-.045em]">Make what you learn usable.</h1>
          <p className="mt-5 max-w-[38ch] text-register leading-[1.65] text-surface-3">Keep the useful idea, practise it actively, and return when it matters.</p>
        </div>
        <p className="font-mono text-mono-sm text-surface-3">Private by default · built for deliberate practice</p>
        <i aria-hidden="true" className="absolute -right-28 -top-28 size-72 rounded-full border border-white/10" />
      </section>
      <section className="grid min-h-screen place-items-center px-5 py-10 md:px-10">
        <div className="w-full md:hidden"><Link href="/" aria-label="Recall home" className="mb-12 inline-flex rounded-sm"><Wordmark size="lg" /></Link></div>
        {children}
      </section>
    </main>
  )
}
