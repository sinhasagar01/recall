'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { CheckInbox } from '@/components/ui/check-inbox'
import { signUp, type SignUpState } from '../actions'

const initialState: SignUpState = { error: null, pendingFor: null }

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUp, initialState)

  /*
    Confirmation required: the account exists but is not usable until the emailed
    link is followed, so there is nowhere to send them yet.
  */
  if (state.pendingFor) {
    return (
      <CheckInbox
        address={state.pendingFor}
        body="Click the link we've sent to finish creating your account. It won't work until you do."
      />
    )
  }

  return (
    <AuthCard
      tagline="One account, one library. Nothing is shared with anyone."
      alt={
        <>
          Already have one?{' '}
          <Link href="/sign-in" className="text-accent-ink underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={formAction}>
        <Field
          /*
            Keyed on the echoed address so a rejected submit remounts the input.
            defaultValue is applied on mount only, and React resets the form when
            the action resolves — restoring the OLD default — so without the key
            the field renders with the right prop and the wrong value.
          */
          key={state.email ?? ''}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          defaultValue={state.email}
        />
        <Field
          label="Password"
          hint="8 characters minimum"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          error={state.error}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={isPending}
          loadingLabel="Creating account…"
        >
          Create account
        </Button>
      </form>
    </AuthCard>
  )
}
