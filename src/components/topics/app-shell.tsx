'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/topics/app-header'
import { GlobalKeys } from '@/components/topics/global-keys'
import { RailNav } from '@/components/topics/rail-nav'
import { TabBar } from '@/components/topics/tab-bar'
import { Wordmark } from '@/components/ui/wordmark'

interface AppShellProps {
  children: ReactNode
  email?: string
  topics: number
  images: number
  total: number
  queued: number
  needsReview: number
  sources: number
  capabilities: number
  demonstrated: number
  ledger: number
  today: { day: string; done: number; written: number }[]
  interview: boolean
}

export function AppShell({
  children,
  email,
  topics,
  images,
  total,
  queued,
  needsReview,
  sources,
  capabilities,
  demonstrated,
  ledger,
  today,
  interview,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-200 ease-out ${collapsed ? 'md:grid-cols-[76px_1fr]' : 'md:grid-cols-[238px_1fr]'}`}>
      <GlobalKeys />
      <aside className={`hidden flex-col gap-[26px] border-r border-rule bg-surface-2 py-[25px] md:sticky md:top-0 md:flex md:h-screen md:self-start md:overflow-y-auto ${collapsed ? 'px-2.5' : 'px-3.5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
          <Link href="/home" aria-label="Recall home" className="inline-flex rounded-sm">
            <Wordmark compact={collapsed} />
          </Link>
          {!collapsed && <RailToggle collapsed={collapsed} onClick={() => setCollapsed(true)} />}
        </div>

        {collapsed && <RailToggle collapsed={collapsed} onClick={() => setCollapsed(false)} />}

        <RailNav
          total={total}
          queued={queued}
          needsReview={needsReview}
          sources={sources}
          capabilities={capabilities}
          demonstrated={demonstrated}
          ledger={ledger}
          today={today}
          interview={interview}
          collapsed={collapsed}
        />

        <Link
          href="/library?add=1"
          aria-label="Add topic"
          title={collapsed ? 'Add topic' : undefined}
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-accent bg-accent py-2.5 font-medium text-[var(--color-accent-foreground)] shadow-card hover:border-accent-ink hover:bg-accent-ink ${collapsed ? 'w-11 px-2 text-title' : 'w-full px-3.5 text-label'}`}
        >
          {collapsed ? '+' : '+ Add topic'}
        </Link>
      </aside>

      <div className="min-w-0">
        <AppHeader email={email} topics={topics} images={images} />
        <main className="max-w-[1920px] px-5 pt-6 pb-24 md:px-[42px] md:pt-[36px] md:pb-15">
          {children}
        </main>
      </div>

      <TabBar />
    </div>
  )
}

function RailToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm border border-transparent text-ink-3 transition-colors hover:border-rule hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[1.5]">
        <path d={collapsed ? 'm6 3 5 5-5 5' : 'm10 3-5 5 5 5'} />
      </svg>
    </button>
  )
}
