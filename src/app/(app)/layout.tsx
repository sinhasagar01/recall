import Link from 'next/link'
import { DeleteAccount } from '@/components/topics/delete-account'
import { GlobalKeys } from '@/components/topics/global-keys'
import { RailNav } from '@/components/topics/rail-nav'
import { Kbd } from '@/components/ui/kbd'
import { Wordmark } from '@/components/ui/wordmark'
import { railCounts } from '@/lib/data/library'
import { practiceQueueSize } from '@/lib/domain/practice-selection'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../(auth)/actions'

/*
  The rail. A server component, so the counts come from the same read the page
  uses and the signed-in identity is rendered server-side.

  The practice count goes through selectPracticeSession rather than counting
  rows, so the rail can never disagree with what pressing Practice will queue.
*/
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  /*
    The email comes from getClaims(), not getUser().

    getUser() asks the auth server, which is a SECOND round-trip on a request where
    proxy.ts has already validated (and possibly refreshed) the session. Supabase
    refresh tokens are single-use, so under concurrent load — Next prefetching, say —
    that second call can lose the race and come back with no user, rendering a signed
    in person's email as blank. getClaims() reads the token the proxy already
    verified. This is display, not authorization: the proxy did the authorizing.
  */
  const supabase = await createClient()
  const [{ data }, counts] = await Promise.all([supabase.auth.getClaims(), railCounts()])

  /*
    Three counts rather than the whole library. This runs on every page in the
    group, so reading every topic here made paginating the library page pointless
    — the rail would have loaded what the page no longer did.
  */
  const queued = practiceQueueSize(counts.total)

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[212px_1fr]">
      {/*
        Mounted once for the whole group, so N, / and P work on the library, the
        weak list and a topic. The rail below has advertised them since phase 4.
      */}
      <GlobalKeys />
      {/*
        Sticky from `md` up, so the rail stays put while the library scrolls.

        `self-start` matters: a grid item stretches to its row by default, so
        without it the rail would be as tall as the whole page and `top-0` would
        have nothing to hold — it would scroll away exactly as before. Pinned to
        `h-screen` instead, with `overflow-y-auto` for the day its own content is
        taller than the viewport.

        The foot keeps its `mt-auto`, which is what design-reference.html
        specifies (`.rail__foot{margin-top:auto}`) and is now doing real work: it
        pins sign-out and the hints to the bottom of the viewport rather than to
        the bottom of a column of unknown length.

        Every class is `md:`-prefixed. Below 860px the rail is `hidden` and the
        tab bar is already fixed; nothing about mobile changes.
      */}
      <aside className="hidden flex-col gap-[26px] border-r border-rule bg-surface-2 px-3.5 py-[22px] md:sticky md:top-0 md:flex md:h-screen md:self-start md:overflow-y-auto">
        <div className="px-2">
          <Wordmark />
        </div>

        <RailNav total={counts.total} queued={queued} needsReview={counts.needsReview} />

        <div className="mt-auto flex flex-col gap-2.5 px-2">
          <p className="font-mono text-mono leading-[1.9] text-ink-3">
            <Kbd>N</Kbd> new topic
            <br />
            <Kbd>/</Kbd> search
            <br />
            <Kbd>P</Kbd> practice
          </p>
          {/*
            The signed-in identity, rendered by a server component. The phase 3
            reload spec asserts on this: it is what proves the session cookie
            survived a full reload and is visible to the server.
          */}
          <p className="truncate font-mono text-mono text-ink-3" data-testid="signed-in-as">
            {data?.claims.email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer rounded-md text-option text-ink-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
          {/* Irreversible, so it sits apart from Sign out and reads quieter. */}
          <DeleteAccount topics={counts.total} images={counts.withImages} />
        </div>
      </aside>

      {/* pb-24 leaves room for the tab bar, which is fixed over the content. */}
      <main className="max-w-[1080px] px-5 pt-6 pb-24 md:px-[34px] md:pt-[30px] md:pb-15">
        {children}
      </main>

      {/*
        The tab bar replaces the rail below --breakpoint-md. Two destinations plus
        the FAB: Weak topics is a filter chip on Library, per DESIGN.md section 4.10,
        not a third tab. /practice sits in its own route group, so it never renders
        this at all — that screen is meant to have nothing to glance at.
      */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around gap-1.5 border-t border-rule bg-surface px-3 pt-2.5 pb-4 md:hidden"
      >
        <TabItem href="/library" label="Library">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 5h7v14H4zM13 5h7v14h-7z" />
          </svg>
        </TabItem>

        <Link
          href="/library?add=1"
          aria-label="Add topic"
          className="-mt-[22px] grid size-[46px] shrink-0 place-items-center rounded-full border-[3px] border-surface bg-accent text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>

        <TabItem href="/practice" label="Practice">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 4a8 8 0 1 0 8 8" />
            <path d="M12 8v4l3 2" />
          </svg>
        </TabItem>
      </nav>
    </div>
  )
}

function TabItem({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 font-mono text-[9.5px] tracking-[0.06em] text-ink-3 uppercase"
    >
      {children}
      {label}
    </Link>
  )
}
