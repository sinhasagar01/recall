import { KINDS, STATUSES, type Kind, type Status } from '@/lib/domain/ledger'

/**
 * Parsing the ledger form.
 *
 * The link is validated http(s)-only, the same rule and for the same reason as a
 * source's URL: a `javascript:` string stored here would later be rendered as a
 * link the user clicks. Blank optional fields become null rather than '', matching
 * the not-blank CHECKs — sending '' turns a user's omission into a constraint error.
 */

export interface LedgerFormInput {
  kind: string
  title: string
  link: string
  note: string
  status: string
  capabilityId: string
}

export interface LedgerFormValue {
  kind: Kind
  title: string
  link: string | null
  note: string | null
  status: Status
  capability_id: string | null
}

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string }

const optional = (raw: string): string | null => {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function parseLedgerForm(input: LedgerFormInput): Parsed<LedgerFormValue> {
  const title = input.title.trim()
  if (title === '') return { error: 'An item needs a title.' }

  if (!KINDS.includes(input.kind as Kind)) return { error: 'Pick what kind of thing this is.' }
  if (!STATUSES.includes(input.status as Status)) return { error: 'Pick a status.' }

  const link = optional(input.link)
  if (link !== null) {
    let parsed: URL
    try {
      parsed = new URL(link)
    } catch {
      return { error: 'That link is not a URL. Paste the whole thing, including https://.' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Links have to be http or https.' }
    }
  }

  return {
    value: {
      kind: input.kind as Kind,
      title,
      link,
      note: optional(input.note),
      status: input.status as Status,
      capability_id: optional(input.capabilityId),
    },
  }
}
