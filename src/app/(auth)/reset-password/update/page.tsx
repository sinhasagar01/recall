'use client'

import { useActionState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { setNewPassword, type AuthState } from '../../actions'

const initialState: AuthState = { error: null }

/*
  Reached only through the emailed link, which /auth/confirm has already exchanged
  for a session. So this page just changes the password of whoever is signed in —
  no token handling of its own.
*/
export default function UpdatePasswordPage() {
  const [state, formAction, isPending] = useActionState(setNewPassword, initialState)

  return (
    <AuthCard tagline="Choose a new password for your account." alt={<span />}>
      <form action={formAction}>
        <Field
          label="New password"
          hint="8 characters minimum"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          error={state.error}
        />
        <Button type="submit" variant="primary" size="lg" block loading={isPending} loadingLabel="Saving…">
          Save new password
        </Button>
      </form>
    </AuthCard>
  )
}
