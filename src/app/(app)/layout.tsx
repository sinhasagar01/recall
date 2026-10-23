import { AppShell } from '@/components/topics/app-shell'
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
    <AppShell
      email={data?.claims.email}
      topics={shell.rail.total}
      images={shell.rail.withImages}
      total={shell.rail.total}
      queued={queued}
      needsReview={shell.rail.needsReview}
      sources={shell.sources}
      capabilities={shell.phases.total}
      demonstrated={shell.phases.demonstrated}
      ledger={shell.ledger}
      today={shell.days}
      interview={hasKey()}
    >
      {children}
    </AppShell>
  )
}
