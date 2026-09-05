'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isTyping } from '@/components/ui/is-typing'

/** The library's search input, when it is on screen. */
export const SEARCH_INPUT_ID = 'library-search'

/**
 * The three shortcuts the rail has always advertised.
 *
 * `N` new topic, `/` search, `P` practice. They were in the mock, the rail
 * rendered the hints, and nothing implemented them — so the sidebar spent the
 * whole build promising three things the app did not do. This is that promise
 * being kept rather than the hints being deleted, because they are good
 * shortcuts and this is a keyboard-shaped tool.
 *
 * Mounted in the (app) layout, so it covers the library, the weak list and a
 * topic. Deliberately NOT in the practice group: a session has its own keys, and
 * `P` while practising means nothing.
 *
 * Search is the reason two of these navigate rather than act. The toolbar lives
 * on the library and reads its state from the URL, so `/` from the weak page has
 * to arrive at the library before it can focus anything — `?focus=search` is how
 * it asks. Same for `N` and `?add=1`, which the mobile FAB already used.
 */
export function GlobalKeys() {
  const router = useRouter()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A shortcut must never eat a browser or OS combination.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault()
          // The sheet is opened by the URL already — the mobile FAB uses the
          // same route — so this works from any page in the group.
          router.push('/library?add=1')
          return

        case '/': {
          event.preventDefault()
          // Already looking at the toolbar: focus it rather than navigating to
          // the page it is on, which would be a server round trip to move a caret.
          const input = document.getElementById(SEARCH_INPUT_ID)
          if (input instanceof HTMLInputElement) {
            input.focus()
            input.select()
          } else {
            router.push('/library?focus=search')
          }
          return
        }

        case 'p':
        case 'P':
          event.preventDefault()
          router.push('/practice')
          return

        default:
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [router])

  return null
}
