import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client. One of three modules in the codebase allowed to import a
 * Supabase client — see ARCHITECTURE.md.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
