import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/ui/wordmark'
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
        <div className="px-2">
          <Wordmark />
        </div>

        <div className="mt-auto">
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="p-6 md:p-8">{children}</main>
    </div>
  )
}
