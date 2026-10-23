'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'recall-theme'
const THEME_EVENT = 'recall-theme-change'

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener)
  return () => window.removeEventListener(THEME_EVENT, listener)
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'amber'
}

export function ThemeToggle() {
  const isAmber = useSyncExternalStore(subscribe, currentTheme, () => false)

  const toggle = () => {
    const next = !isAmber
    document.documentElement.dataset.theme = next ? 'amber' : 'light'
    window.localStorage.setItem(STORAGE_KEY, next ? 'amber' : 'light')
    window.dispatchEvent(new Event(THEME_EVENT))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isAmber}
      aria-label={isAmber ? 'Use light theme' : 'Use Amber Ledger dark theme'}
      className="grid size-9 cursor-pointer place-items-center rounded-md border border-rule bg-surface text-ink-2 transition hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
    >
      {isAmber ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>
      )}
    </button>
  )
}
