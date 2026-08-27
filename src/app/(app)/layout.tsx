import Link from 'next/link'
import { Kbd } from '@/components/ui/kbd'
import { Wordmark } from '@/components/ui/wordmark'
import { listTopics } from '@/lib/data/topics'
import { needsReview } from '@/lib/domain/library'
import { noShuffle, selectPracticeSession } from '@/lib/domain/practice-selection'
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
  const [{ data }, { topics }] = await Promise.all([supabase.auth.getClaims(), listTopics()])

  const queued = selectPracticeSession(topics, { shuffle: noShuffle }).length
  const review = topics.filter(needsReview).length

  const navItem = 'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-option text-ink-2'

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[212px_1fr]">
      <aside className="hidden flex-col gap-[26px] border-r border-rule bg-surface-2 px-3.5 py-[22px] md:flex">
        <div className="px-2">
          <Wordmark />
        </div>

        <nav className="flex flex-col gap-0.5">
          <span className={`${navItem} bg-surface text-ink`} aria-current="page">
            <span>Library</span>
            <span className="font-mono text-mono-sm text-ink-3">{topics.length}</span>
          </span>
          <Link href="/practice" className={`${navItem} hover:bg-surface hover:text-ink`}>
            <span>Practice</span>
            <span className="font-mono text-mono-sm text-ink-3">{queued} queued</span>
          </Link>
          <Link href="/weak" className={`${navItem} hover:bg-surface hover:text-ink`}>
            <span>Weak topics</span>
            <span className="font-mono text-mono-sm text-flag">{review}</span>
          </Link>
        </nav>

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
        </div>
      </aside>

      <main className="max-w-[1080px] px-[34px] pt-[30px] pb-15">{children}</main>
    </div>
  )
}
