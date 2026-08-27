import { createClient } from '@/lib/supabase/server'

/*
  A placeholder. Phase 5 builds the real library.
  
  It is a SERVER component reading the user on purpose: rendering the email here
  is what proves the session cookie survived the round trip and is visible to the
  server, which is the failure mode phase 3 exists to prevent. The Playwright spec
  asserts on `signed-in-as` after a full reload.
*/
export default async function LibraryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div>
      <h1 className="font-display text-page-title font-medium tracking-[-0.02em]">My knowledge</h1>
      <p className="mt-2 text-body text-ink-2">
        Signed in as <span data-testid="signed-in-as">{user?.email}</span>
      </p>
    </div>
  )
}
