/**
 * Reading the add/edit source form.
 *
 * Pure, so the rules are testable without a form, a request or a database — and
 * run on the server as well, because `required` on an input is a courtesy to the
 * person rather than a guarantee to an action.
 */

export interface SourceFormInput {
  title: string
  course: string
  url: string
  transcript: string
}

export type ParsedSource =
  | { error: string; value?: undefined }
  | {
      error?: undefined
      value: { title: string; course: string | null; url: string | null; transcript: string | null }
    }

export function parseSourceForm(input: SourceFormInput): ParsedSource {
  const title = input.title.trim()
  const course = input.course.trim()
  const url = input.url.trim()
  // NOT trimmed to a single line: a transcript's shape is part of reading it.
  const transcript = input.transcript.trim()

  if (title === '') return { error: 'Give the source a title so you can find it again.' }

  /*
    A URL or nothing, parsed rather than pattern-matched, and restricted to
    http(s) so a `javascript:` string cannot be stored and later rendered as the
    link you click to go back to the lesson.
  */
  if (url !== '') {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { error: 'That link is not a URL. Paste the whole thing, including https://.' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Links have to be http or https.' }
    }
  }

  // Blank is not a value: the CHECK constraints reject an empty string, and the
  // absence of a course is null.
  return {
    value: {
      title,
      course: course === '' ? null : course,
      url: url === '' ? null : url,
      transcript: transcript === '' ? null : transcript,
    },
  }
}
