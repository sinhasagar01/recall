import { describe, expect, it } from 'vitest'
import { authFailureMessage, CREDENTIALS_REJECTED } from '@/lib/domain/auth-errors'

const vague = /something went wrong|try again later|an error occurred/i

describe('authFailureMessage', () => {
  it('says the credentials are wrong when they are', () => {
    expect(authFailureMessage({ code: 'invalid_credentials', status: 400 })).toBe(
      CREDENTIALS_REJECTED,
    )
  })

  it('does NOT blame the password when the server is unreachable', () => {
    // The whole point. This case used to render as a wrong password, sending
    // people to reset a password that was never the problem.
    const message = authFailureMessage({ name: 'AuthRetryableFetchError' })
    expect(message).not.toBe(CREDENTIALS_REJECTED)
    expect(message).toContain('not your password')
  })

  it.each([500, 502, 503])('treats a %i as a connection problem', (status) => {
    expect(authFailureMessage({ status })).toContain('not your password')
  })

  it('treats a failure with no status at all as unreachable, not as a bad password', () => {
    // DNS failure, TLS failure, wrong URL in the environment — none of which the
    // person typing their password can do anything about.
    expect(authFailureMessage({})).not.toBe(CREDENTIALS_REJECTED)
  })

  it('still reads a bare 400 as the auth server saying no', () => {
    expect(authFailureMessage({ status: 400 })).toBe(CREDENTIALS_REJECTED)
  })

  it('tells someone their email is unconfirmed rather than wrong', () => {
    expect(authFailureMessage({ code: 'email_not_confirmed', status: 400 })).toContain('Confirm your email')
  })

  it('says accounts are closed when sign-up is disabled', () => {
    // Relevant now: public sign-up is turned off on the hosted project.
    expect(authFailureMessage({ code: 'signup_disabled', status: 422 })).toContain('closed')
  })

  it('names rate limiting rather than blaming the password', () => {
    const message = authFailureMessage({ code: 'over_request_rate_limit', status: 429 })
    expect(message).toContain('Too many attempts')
    expect(message).not.toBe(CREDENTIALS_REJECTED)
  })

  it('never apologises and is never vague', () => {
    const cases: Parameters<typeof authFailureMessage>[0][] = [
      { code: 'invalid_credentials', status: 400 },
      { name: 'AuthRetryableFetchError' },
      { code: 'over_request_rate_limit', status: 429 },
      { status: 503 },
      {},
    ]
    for (const failure of cases) {
      const message = authFailureMessage(failure)
      expect(message).not.toMatch(vague)
      expect(message).not.toMatch(/sorry|apolog/i)
      expect(message.length).toBeGreaterThan(20)
    }
  })
})
