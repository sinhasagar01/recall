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
        </>
      }
    >
      <form action={formAction}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
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
