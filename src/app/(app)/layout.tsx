import Link from 'next/link'
import { AppHeader } from '@/components/topics/app-header'
import { GlobalKeys } from '@/components/topics/global-keys'
import { RailNav } from '@/components/topics/rail-nav'
import { TabBar } from '@/components/topics/tab-bar'
import { Wordmark } from '@/components/ui/wordmark'
import { hasKey } from '@/lib/ai/client'
import { readAppShellSummary } from '@/lib/data/app-shell'
import { practiceQueueSize } from '@/lib/domain/practice-selection'
import { createClient } from '@/lib/supabase/server'

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
  const [{ data }, shell] = await Promise.all([
    supabase.auth.getClaims(),
    readAppShellSummary(),
  ])

  /*
    One compact aggregate rather than separate counts or the whole library. This
    runs on every page in the group, so it must stay independent of library size.
  */
  const queued = practiceQueueSize(shell.rail.total)

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[238px_1fr]">
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
      <aside className="hidden flex-col gap-[26px] border-r border-rule bg-surface-2 px-3.5 py-[25px] md:sticky md:top-0 md:flex md:h-screen md:self-start md:overflow-y-auto">
        <div className="px-2">
          <Link href="/home" aria-label="Recall home" className="inline-flex rounded-sm">
            <Wordmark />
          </Link>
        </div>

        {/* `interview` is absent-not-disabled: no key, no entry, matching the route's own notFound(). */}
        <RailNav
          total={shell.rail.total}
          queued={queued}
          needsReview={shell.rail.needsReview}
          sources={shell.sources}
          capabilities={shell.phases.total}
          demonstrated={shell.phases.demonstrated}
          ledger={shell.ledger}
          today={shell.days}
          interview={hasKey()}
        />

        {/*
          The rail's own + Add topic, which design-reference.html:439 draws below
          the nav and the build never had.

          Not removed and not conditional — never built. Phase 3 created this file
          with a comment saying the mock's rail "also holds the nav with counts and
          the + Add topic button — those are Phase 4/5". Phase 5 built the nav with
          counts, rewrote this file, and the comment recording the obligation went
          with it. A deferral written into the file that the arc honouring it
          rewrites is a deferral nobody inherits.

          `?add=1` rather than a client handler, so it works from every page in the
          group — the same mechanism the mobile FAB already uses.
        */}
        <Link
          href="/library?add=1"
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white shadow-card hover:border-accent-ink hover:bg-accent-ink"
        >
          + Add topic
        </Link>

      </aside>

      {/* pb-24 leaves room for the tab bar, which is fixed over the content. */}
      <div className="min-w-0">
        <AppHeader email={data?.claims.email} topics={shell.rail.total} images={shell.rail.withImages} />
        <main className="max-w-[1920px] px-5 pt-6 pb-24 md:px-[42px] md:pt-[36px] md:pb-15">
          {children}
        </main>
      </div>

      {/*
        The tab bar replaces the rail below --breakpoint-md. Two destinations plus
        the FAB: Weak topics is a filter chip on Library, per DESIGN.md, "Mobile has
        two destinations plus add", not a third tab. /practice sits in its own route
        group, so it never renders this at all — that screen is meant to have
        nothing to glance at.

        A component rather than markup here, because it has to know the route to
        say which tab you are on, and this file is a server component.
      */}
      <TabBar />
    </div>
  )
}
