'use client'

import { useActionState } from 'react'
import { changePassword, type PasswordState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

const initialState: PasswordState = { error: null, changed: false }

/**
 * Change your password without signing out.
 *
 * The current password is required. Supabase would accept the change on session
 * validity alone; see `changePassword` for why that is not good enough.
 *
 * Composed from Field and Button — the same primitives the sign-in and sign-up
 * screens use — because this is the same shape of form and there is no reason
 * for it to look like a different product.
 */
export function ChangePassword() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState)

  return (
    <form action={formAction} className="mt-4 max-w-[380px]">
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        hint="8 characters minimum"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        error={state.error}
      />

      <Button type="submit" variant="primary" loading={isPending} loadingLabel="Saving…">
        Change password
      </Button>

      {state.changed ? (
        <p role="status" className="mt-3 font-mono text-[11.5px] text-ink-3">
          Password changed. You&rsquo;re still signed in here.
        </p>
      ) : null}
    </form>
  )
}
