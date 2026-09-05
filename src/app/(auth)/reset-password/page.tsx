'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CheckInbox } from '@/components/ui/check-inbox'
import { requestPasswordReset, type ResetState } from '../actions'

const initialState: ResetState = { error: null, sentTo: null }

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState)

  if (state.sentTo) {
    return (
      <CheckInbox
        address={state.sentTo}
        body="If there's an account for that address, a link to choose a new password is on its way."
      />
    )
  }

  return (
    <AuthCard
      tagline="Choose a new password. We'll email you a link."
      alt={
        <Link href="/sign-in" className="text-accent-ink underline">
          Back to sign in
        </Link>
      }
    >
      <form action={formAction}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={state.error}
        />
        <Button type="submit" variant="primary" size="lg" block loading={isPending} loadingLabel="Sending…">
          Send reset link
        </Button>
      </form>
    </AuthCard>
  )
}
