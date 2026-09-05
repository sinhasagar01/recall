'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { signIn, type AuthState } from '../actions'

const initialState: AuthState = { error: null }

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signIn, initialState)

  return (
    <AuthCard
      tagline="Your own record of what you understand — and what you only think you do."
      alt={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="text-accent-ink underline">
            Create one
          </Link>
          <br />
          <Link href="/reset-password" className="text-accent-ink underline">
            Forgotten your password?
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
          required
          defaultValue={state.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.error}
        />
        <Button type="submit" variant="primary" size="lg" block loading={isPending} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>
    </AuthCard>
  )
}
