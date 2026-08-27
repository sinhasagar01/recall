import { signOut } from '../(auth)/actions'

/*
  Deliberately minimal. The mock's rail also holds the nav with counts and the
  "+ Add topic" button — those are Phase 4/5, and inventing them now would mean
  building the library UI this phase said not to build. Sign out sits where the
  mock puts it: the foot of the rail.
*/
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[228px_1fr]">
      <aside className="hidden flex-col gap-5 border-r border-rule bg-surface-2 p-5 md:flex">
        <div className="flex items-baseline gap-[7px] px-2">
          <span className="font-display text-wordmark font-semibold tracking-[-0.02em]">Recall</span>
          <span className="size-[5px] rounded-full bg-accent" />
        </div>

        <div className="mt-auto">
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md py-2 text-body text-ink-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="p-6 md:p-8">{children}</main>
    </div>
  )
}
