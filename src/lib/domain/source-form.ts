import { parseDuration } from '@/lib/domain/duration'

/**
 * Reading the add/edit source form.
 *
 * Pure, so the rules are testable without a form, a request or a database — and
 * run on the server as well, because `required` on an input is a courtesy to the
 * person rather than a guarantee to an action.
 */

export interface SourceFormInput {
  /** A source is a lesson. Arc 2 called this `title`. */
  lesson: string
  course: string
  chapter: string
  /** Free text — "13m 23s", "1:12:04", "90". Parsed to seconds here. */
  length: string
  url: string
  transcript: string
}

export type ParsedSource =
  | { error: string; value?: undefined }
  | {
      error?: undefined
      value: {
        lesson: string
        course: string | null
        chapter: string | null
        duration_seconds: number | null
        url: string | null
        transcript: string | null
      }
    }

export function parseSourceForm(input: SourceFormInput): ParsedSource {
  const lesson = input.lesson.trim()
  const course = input.course.trim()
  const chapter = input.chapter.trim()
  const url = input.url.trim()
  // NOT trimmed to a single line: a transcript's shape is part of reading it.
  const transcript = input.transcript.trim()

  if (lesson === '') return { error: 'Name the lesson so you can find it again.' }

  /*
    A chapter without a course is a chapter of nothing. It would group under "No
    course" and read as though the course had been lost rather than never given,
    so it is refused where the mistake was made.
  */
  if (chapter !== '' && course === '') {
    return { error: 'A chapter belongs to a course. Name the course, or leave the chapter empty.' }
  }

  /*
    The length is parsed HERE rather than at the input, so the server refuses
    what the browser would have — `required` on an input is a courtesy to the
    person, not a guarantee to an action. A failed parse is an error the form
    shows; it is never stored as zero.
  */
  const length = parseDuration(input.length)
  if (length?.error !== undefined) return { error: length.error }

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
      lesson,
      course: course === '' ? null : course,
      chapter: chapter === '' ? null : chapter,
      duration_seconds: length?.seconds ?? null,
      url: url === '' ? null : url,
      transcript: transcript === '' ? null : transcript,
    },
  }
}
