'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signUp, type AuthState } from '../actions'

const initialState: AuthState = { error: null }

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUp, initialState)

  return (
    <div className="w-[min(400px,100%)]">
      <div className="mb-2 flex items-baseline justify-center gap-2">
        <span className="font-display text-wordmark-lg font-semibold tracking-[-0.02em]">Recall</span>
        <span className="size-[5px] rounded-full bg-accent" />
      </div>

      <p className="mb-8 text-center text-[14px] text-ink-2">
        One account, one library. Nothing is shared with anyone.
      </p>

      <form
        action={formAction}
        className="rounded-lg border border-rule bg-surface p-[26px] shadow-card"
      >
        <div className="mb-[18px]">
          <label htmlFor="email" className="mb-1.5 block text-label font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="password" className="mb-1.5 block text-label font-medium text-ink">
            Password
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              8 characters minimum
            </span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'password-error' : undefined}
            className={`w-full rounded-md border bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] ${
              state.error
                ? 'border-flag focus:border-flag focus:outline-2 focus:outline-flag'
                : 'border-rule-strong focus:border-accent focus:outline-2 focus:outline-accent'
            }`}
          />
          {state.error ? (
            <p
              id="password-error"
              role="alert"
              className="mt-1.5 flex items-center gap-1.5 text-meta text-flag"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <path d="M12 16.5v.5" />
              </svg>
              {state.error}
            </p>
          ) : null}
        </div>

        {/*
          The submitting state the mock draws: spinner plus "Creating account…".
          DESIGN.md — an action keeps its name through the whole flow, so
          "Create account" becomes "Creating account…", not "Please wait".
        */}
        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isPending ? (
            <span
              aria-hidden="true"
              className="size-[13px] animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
            />
          ) : null}
          {isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-[18px] text-center text-label text-ink-2">
        Already have one?{' '}
        <Link href="/sign-in" className="text-accent-ink underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
