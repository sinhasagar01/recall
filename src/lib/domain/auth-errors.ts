/**
 * Turning a sign-in failure into something true.
 *
 * The bug this replaces: every failure became "That email and password don't
 * match an account." — including an unreachable database. DESIGN.md, "Copy rules"
 * says errors state what happened and what to do, and are never vague; telling
 * someone their password is wrong when the service is down is exactly that, and
 * it sends them to reset a password that was never the problem.
 *
 * Structurally typed on purpose. The domain layer imports nothing from Supabase,
 * and this needs only the three fields auth-js actually sets.
 */
export interface AuthFailure {
  name?: string
  code?: string
  status?: number
}

export const CREDENTIALS_REJECTED = "That email and password don't match an account."

const UNREACHABLE =
  "Couldn't reach the server. This is a connection problem, not your password — try again in a moment."

export function authFailureMessage(error: AuthFailure): string {
  // auth-js raises this for a failed fetch or a 5xx; it is the case that used to
  // be misreported as a wrong password.
  if (error.name === 'AuthRetryableFetchError') return UNREACHABLE
  if (typeof error.status === 'number' && error.status >= 500) return UNREACHABLE

  switch (error.code) {
    case 'invalid_credentials':
      return CREDENTIALS_REJECTED
    case 'email_not_confirmed':
      return 'Confirm your email address first — check your inbox for the link, then sign in.'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts are closed right now. Ask the owner for access.'
    case 'user_banned':
      return 'This account is suspended.'
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.'
    case 'validation_failed':
    case 'email_address_invalid':
      return "That doesn't look like an email address."
    default:
      break
  }

  /*
    A 400 with no recognised code is still the auth server saying no, so the
    credentials line is the honest reading. Anything else — no status at all,
    which is what a DNS or TLS failure looks like — is not.
  */
  return error.status === 400 ? CREDENTIALS_REJECTED : UNREACHABLE
}
