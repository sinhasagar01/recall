'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AuthCard } from '@/components/ui/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { signUp, type AuthState } from '../actions'

const initialState: AuthState = { error: null }

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUp, initialState)

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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
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
