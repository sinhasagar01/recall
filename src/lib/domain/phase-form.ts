/**
 * Parsing the phase and capability forms.
 *
 * Blank optional fields become null rather than empty strings, matching the
 * not-blank CHECKs: the database refuses `''`, so sending one would turn a user's
 * omission into an error message about a constraint.
 */

export interface PhaseFormInput {
  name: string
  when_text: string
  sources_text: string
}

export interface PhaseFormValue {
  name: string
  when_text: string | null
  sources_text: string | null
}

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string }

const optional = (raw: string): string | null => {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function parsePhaseForm(input: PhaseFormInput): Parsed<PhaseFormValue> {
  const name = input.name.trim()
  if (name === '') return { error: 'A phase needs a name.' }

  return {
    value: {
      name,
      /*
        "When" is free text and stays that way. Nothing parses it, nothing
        compares it to today, and no date is derived from it — a date would let
        the product work out that you are behind, which is the thing this screen
        exists to refuse.
      */
      when_text: optional(input.when_text),
      sources_text: optional(input.sources_text),
    },
  }
}

export function parseCapabilityForm(name: string): Parsed<string> {
  const trimmed = name.trim()
  if (trimmed === '') return { error: 'Write what you will be able to do.' }
  return { value: trimmed }
}
