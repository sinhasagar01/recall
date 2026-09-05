import Link from 'next/link'
import { AuthCard } from '@/components/ui/auth-card'

/**
 * The state after anything that sends an email.
 *
 * Shared by sign-up and password reset so the two cannot drift into saying
 * different things about the same situation.
 */
export function CheckInbox({ address, body }: { address: string; body: string }) {
  return (
    <AuthCard
      tagline="Nothing else to do here until you've clicked the link."
      alt={
        <Link href="/sign-in" className="text-accent-ink underline">
          Back to sign in
        </Link>
      }
    >
      <h1 className="mb-2 font-display text-[22px] font-medium">Check your inbox</h1>
      <p className="text-body text-ink-2">{body}</p>
      <p className="mt-3 font-mono text-mono-sm text-ink-3">{address}</p>
    </AuthCard>
  )
}
