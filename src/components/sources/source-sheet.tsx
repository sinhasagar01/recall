'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { createSource, saveSource } from '@/app/(app)/sources/actions'
import { formatDuration, parseDuration } from '@/lib/domain/duration'
import { plural } from '@/lib/domain/plural'
import type { Source, SourceSummary } from '@/lib/domain/sources'

/**
 * Course → chapter → lesson, in that order, top to bottom.
 *
 * Broadest first, the way the sidebar of any course reads. Arc 2 put "Title" at
 * the top with an unexplained "Course" beneath it, which is exactly why neither
 * was clear — **a source is a lesson**, so the field says lesson.
 *
 * ── Course and chapter autocomplete from your own data ──────────────────────
 * Course offers every course you have used, with a lesson count. Chapter offers
 * only the chapters already in the course you chose — a chapter list spanning
 * every course would be a list of names that do not go together. Both accept a
 * value that is not in the list: it is a convenience, not a constraint.
 *
 * Opening the form fresh **prefills the chapter from your last save in that
 * course**, and the chapter list is ordered by recency rather than
 * alphabetically, because you work through one chapter over several sittings.
 *
 * ── Save and add the next lesson ────────────────────────────────────────────
 * Keeps course and chapter, clears lesson, URL, length and transcript, and puts
 * the cursor back in the lesson field. You add ten lessons from one chapter in a
 * sitting; retyping the course ten times is the friction that kills the habit.
 */
export function SourceSheet({
  source,
  siblings = [],
  onClose,
}: {
  source?: Source
  /** Every other source, for the two comboboxes. Names only. */
  siblings?: SourceSummary[]
  onClose: () => void
}) {
  const router = useRouter()

  const [course, setCourse] = useState(source?.course ?? '')
  const [chapter, setChapter] = useState(source?.chapter ?? '')
  const [lesson, setLesson] = useState(source?.lesson ?? '')
  const [url, setUrl] = useState(source?.url ?? '')
  const [length, setLength] = useState(
    source?.duration_seconds ? (formatDuration(source.duration_seconds) ?? '') : '',
  )
  const [transcript, setTranscript] = useState(source?.transcript ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const lessonRef = useRef<HTMLInputElement>(null)
  const [savedNext, setSavedNext] = useState(0)

  /*
    Focus in an effect, and only once the transition has FINISHED.

    Two races, both found by the same assertion failing under a full parallel run
    while passing alone — the worst kind, because the feature looks fine.

    Calling `.focus()` inline after `setLesson('')` races the re-render that
    clears the field. Moving it to an effect on `savedNext` fixed that and left
    the second: `router.refresh()` re-renders the server tree afterwards, and
    that render lands after the effect and takes the cursor away again.

    Gating on `!isSaving` waits for the whole transition, refresh included, so
    there is nothing left to re-render over it.
  */
  useEffect(() => {
    if (savedNext > 0 && !isSaving) lessonRef.current?.focus()
  }, [savedNext, isSaving])

  /* Newest first, so the course you are working through is at the top. */
  const byRecency = useMemo(
    () => [...siblings].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [siblings],
  )

  const courseOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const other of byRecency) {
      if (other.course === null) continue
      counts.set(other.course, (counts.get(other.course) ?? 0) + 1)
    }
    return [...counts].map(([value, count]) => ({ value, detail: plural(count, 'lesson') }))
  }, [byRecency])

  /* Only the chapters in the course you chose. */
  const chapterOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { value: string; detail?: string }[] = []
    for (const other of byRecency) {
      if (other.course !== course.trim() || other.chapter === null) continue
      if (seen.has(other.chapter)) continue
      seen.add(other.chapter)
      out.push({ value: other.chapter })
    }
    return out
  }, [byRecency, course])

  /*
    Picking a course prefills the chapter you last used in it — but never over
    something you have already typed, and never when editing an existing source.
  */
  const pickCourse = (next: string) => {
    setCourse(next)
    if (source || chapter.trim() !== '') return
    const lastInCourse = byRecency.find(
      (other) => other.course === next.trim() && other.chapter !== null,
    )
    if (lastInCourse?.chapter) setChapter(lastInCourse.chapter)
  }

  /*
    The live breadcrumb, which is the point of having one: it shows exactly what
    will be stored, so an empty chapter or a mistyped course is visible BEFORE
    you press. It also echoes the parsed length back, which is what makes "90"
    meaning ninety minutes safe rather than a guess you cannot see.
  */
  const parsedLength = parseDuration(length)
  const crumbs = [course.trim(), chapter.trim(), lesson.trim()].filter((level) => level !== '')

  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result = source ? await saveSource(source.id, formData) : await createSource(formData)

      if (result.error !== null) {
        setError(result.error)
        return
      }

      if (formData.get('intent') === 'next') {
        setLesson('')
        setUrl('')
        setLength('')
        setTranscript('')
        setSavedNext((count) => count + 1)
        router.refresh()
        return
      }

      onClose()
      if (!source && result.id) router.push(`/sources/${result.id}`)
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={source ? 'Edit source' : 'Add a source'}
      footer={
        <>
          <Button
            type="submit"
            form="source"
            variant="primary"
            size="lg"
            loading={isSaving}
            loadingLabel="Saving…"
          >
            Save source
          </Button>
          {!source ? (
            <Button
              type="submit"
              form="source"
              name="intent"
              value="next"
              size="lg"
              disabled={isSaving}
            >
              Save and add the next lesson
            </Button>
          ) : null}
          <span className="font-mono text-[11.5px] text-ink-3">Only the lesson is required</span>
        </>
      }
    >
      <form id="source" action={submit}>
        {error ? (
          <p
            role="alert"
            className="mb-[18px] rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
          >
            {error}
          </p>
        ) : null}

        <Combobox
          label="Course"
          hint="optional · reused from what you have added"
          name="course"
          value={course}
          options={courseOptions}
          placeholder="e.g. JavaScript: The Hard Parts, v3"
          newLabel={(text) => `Use “${text}” as a new course`}
          onChange={pickCourse}
        />

        <Combobox
          label="Chapter"
          hint="optional · picked from this course"
          name="chapter"
          value={chapter}
          options={chapterOptions}
          newLabel={(text) => `Use “${text}” as a new chapter`}
          onChange={setChapter}
        />

        <Field
          label="Lesson"
          name="lesson"
          required
          ref={lessonRef}
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-x-3.5 sm:grid-cols-[1fr_150px]">
          <Field
            label="URL"
            name="url"
            hint="optional"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Field
            label="Length"
            name="length"
            hint="optional"
            placeholder="13m 23s"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            error={parsedLength?.error ?? null}
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="transcript" className="mb-1.5 block text-label font-medium text-ink">
            Transcript
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              optional · scratch, deletable
            </span>
          </label>
          <textarea
            id="transcript"
            name="transcript"
            rows={8}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        {crumbs.length > 0 ? (
          <>
            <span className="mb-2 block font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              This will be saved as
            </span>
            <p
              data-testid="form-breadcrumb"
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-rule bg-surface-2 px-4 py-3 text-option"
            >
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className="flex items-baseline gap-x-2">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-rule-strong">
                      ›
                    </span>
                  ) : null}
                  <b className="font-medium">{crumb}</b>
                </span>
              ))}
              {parsedLength?.seconds ? (
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  {formatDuration(parsedLength.seconds)}
                </span>
              ) : null}
            </p>
          </>
        ) : null}
      </form>
    </Sheet>
  )
}
