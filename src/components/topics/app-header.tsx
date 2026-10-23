'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/(auth)/actions'
import { DeleteAccount } from '@/components/topics/delete-account'
import { Wordmark } from '@/components/ui/wordmark'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const PAGE_LABELS: [prefix: string, label: string][] = [
  ['/library', 'Library'],
  ['/topic', 'Library'],
  ['/practice', 'Practice'],
  ['/weak', 'Review'],
  ['/learn', 'Learn'],
  ['/sources', 'Sources'],
  ['/today', 'Today'],
  ['/phases', 'Phases'],
  ['/ledger', 'Ledger'],
  ['/interview', 'Interview'],
  ['/settings', 'Settings'],
]

function pageLabel(pathname: string) {
  return PAGE_LABELS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Home'
}

export function AppHeader({
  email,
  topics,
  images,
}: {
  email: string | undefined
  topics: number
  images: number
}) {
  const pathname = usePathname()
  const profileRef = useRef<HTMLDetailsElement>(null)
  const label = pageLabel(pathname)
  const initials = (email ?? 'Recall')
    .split('@')[0]
    .split(/[._-]/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (profileRef.current?.open && !profileRef.current.contains(event.target as Node)) {
        profileRef.current.open = false
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && profileRef.current?.open) profileRef.current.open = false
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <header className="relative z-50 flex h-16 items-center justify-between border-b border-rule bg-surface/90 px-4 backdrop-blur-sm md:h-[75px] md:px-[42px]">
      <Link href="/home" aria-label="Recall home" className="rounded-sm md:hidden">
        <Wordmark />
      </Link>
      <p className="hidden text-meta text-ink-3 md:block">
        <span className="font-medium text-ink">{label}</span>
        <span aria-hidden="true" className="mx-2 text-rule-strong">/</span>
        <span>Your workspace</span>
      </p>
      <div className="flex items-center gap-2">
      <ThemeToggle />
      <details ref={profileRef} className="group relative">
        <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-md border border-rule bg-accent-soft font-mono text-mono-sm font-medium text-accent-ink marker:content-none transition hover:border-accent hover:bg-accent hover:text-white">
          <span className="sr-only">Open profile menu</span>
          {initials}
        </summary>
        <div className="absolute right-0 top-[calc(100%+10px)] z-60 w-60 rounded-md border border-rule-strong bg-surface p-2 shadow-pop">
          <p className="truncate px-2.5 py-2 font-mono text-mono-sm text-ink-3" data-testid="signed-in-as">{email ?? 'Signed in'}</p>
          <div className="border-t border-rule pt-1">
            <Link href="/settings" className="flex min-h-9 items-center rounded-sm px-2.5 text-option text-ink-2 hover:bg-surface-2 hover:text-ink">Settings</Link>
            <form action={signOut}>
              <button type="submit" className="flex min-h-9 w-full cursor-pointer items-center rounded-sm px-2.5 text-left text-option text-ink-2 hover:bg-surface-2 hover:text-ink">Sign out</button>
            </form>
          </div>
          <div className="mt-1 border-t border-rule pt-1 px-0.5">
            <DeleteAccount topics={topics} images={images} />
          </div>
        </div>
      </details>
      </div>
    </header>
  )
}
