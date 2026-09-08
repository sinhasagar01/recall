'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { CoverageList } from '@/components/sources/coverage-list'
import { Button } from '@/components/ui/button'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { Modal } from '@/components/ui/modal'
import { QuizBadge } from '@/components/ui/quiz-badge'
import { SourceSheet } from '@/components/sources/source-sheet'
import { removeSource, removeTranscript } from '@/app/(app)/sources/actions'
import { topicPath } from '@/lib/domain/library'
import {
  definitionFromSelection,
  deleteSourceCopy,
  sourceProgress,
  sourceProgressCopy,
  transcriptState,
  type Source,
  type SourceSummary,
} from '@/lib/domain/sources'
import type { Topic } from '@/lib/domain/types'

/**
 * The source workspace: read on the left, distil on the right.
 *
 * ── The one thing that must never be prefilled ──────────────────────────────
 * Selecting transcript text fills the **definition**. It never fills the mental
 * model. The definition is the fact and someone else's words are fine for it; the
 * mental model is the correction only you can write, and a prefilled one would be
 * a quotation pretending to be understanding. That single rule is the difference
 * between this and a note-taking app — `definitionFromSelection` returns a shape
 * with no field to put a model in, so there is nothing to get wrong here.
 *
 * ── Where arc 6 attached ────────────────────────────────────────────────────
 * Arc 2 left room here for AI and predicted the shape of it: *"the transcript
 * stays reachable server-side… both actions will send it to a model from the
 * server, so it must not exist only in browser state."* That held. `extract`
 * takes a source id and reads the body server-side, so the browser never
 * uploads a transcript and never sees a key.
 *
 * What arc 2 did not predict is that one send box replaced the whole extraction
 * checklist rather than sitting beside it — the checklist was a proxy for "have
 * I mined this video", and extraction made the real answer cheap enough to show.
 *
 * The manual path below is untouched and is not a fallback in name only: with no
 * key configured it is the ONLY path, and there is no Extract button to explain
 * its absence — see the quiz rule in DESIGN.md, a disabled button still says
 * button.
 */
export function SourceWorkspace({
  source,
  entries,
  siblings = [],
}: {
  source: Source
  entries: Topic[]
  /** Every other source, for the edit sheet's course and chapter comboboxes. */
  siblings?: SourceSummary[]
}) {
  // The confirmation's wording agrees with the count — see deleteSourceCopy.
  const deleteCopy = deleteSourceCopy(entries.length)
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<'source' | 'transcript' | null>(null)
  const [selection, setSelection] = useState('')
  const [query, setQuery] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [isSaving, startSaving] = useTransition()

  const progress = sourceProgress(entries)
  const state = transcriptState(source)

  /*
    Searched in the browser, over text already on screen.

    A query would cost a round trip and an index on a column that must never be
    indexed for library search — and would leave behind exactly the machinery
    someone later reuses to "just also search transcripts". The way to keep a
    transcript out of library search is to never build a server-side way to
    search it.
  */
  const lines = useMemo(() => (source.transcript ?? '').split('\n').filter(Boolean), [source.transcript])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === '' ? lines : lines.filter((line) => line.toLowerCase().includes(needle))
  }, [lines, query])

  const captureSelection = () => {
    const text = window.getSelection()?.toString() ?? ''
    setSelection(text.trim() === '' ? '' : definitionFromSelection(text).definition)
  }

  return (
    <>
      <div className="mb-[26px] flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
            {source.lesson}
          </h1>
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
            {source.course ? `${source.course} · ` : ''}
            {state === 'present' ? `${source.transcript_words?.toLocaleString()} words · ` : ''}
            <span data-testid="source-progress">{sourceProgressCopy(progress)}</span>
            {source.url ? (
              <>
                {' · '}
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline hover:text-ink">
                  open
                </a>
              </>
            ) : null}
          </p>
        </div>
        <Button onClick={() => setEditing(true)}>Edit source</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.1fr_1fr]">
        {/* ── Read ────────────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              Transcript · scratch
            </span>
            {/* Collapsed behind Show below the breakpoint: reading a transcript and
                writing beside it does not fit on a phone. */}
            <Button
              className="md:hidden"
              aria-expanded={showTranscript}
              aria-controls="transcript"
              onClick={() => setShowTranscript((open) => !open)}
            >
              {showTranscript ? 'Hide' : 'Show'}
            </Button>
          </div>

          {state === 'present' ? (
            <div id="transcript" className={showTranscript ? '' : 'hidden md:block'}>
              <input
                type="search"
                aria-label="Search this transcript"
                placeholder="Search this transcript…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mb-2.5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
              />

              <div
                onMouseUp={captureSelection}
                className="max-h-[440px] overflow-auto rounded-lg border border-rule bg-surface-2 p-4 text-option leading-[1.75] text-ink-2"
              >
                {matches.map((line, index) => (
                  <p key={index} className="mb-2.5 last:mb-0">
                    {line}
                  </p>
                ))}
                {matches.length === 0 ? (
                  <p className="font-mono text-[11.5px] text-ink-3">Nothing in the transcript matches that.</p>
                ) : null}
              </div>

              {/* Desktop only. Text selection on a touch screen fights the
                  browser's own selection UI, so on mobile you read and type. */}
              {selection === '' ? null : (
                <div className="mt-2.5 hidden items-center gap-3 md:flex">
                  <span className="font-mono text-[11.5px] text-ink-3">
                    Selected {selection.split(/\s+/).length} words
                  </span>
                  <Button data-testid="use-as-definition" onClick={() => setSelection(selection)}>
                    Use as definition →
                  </Button>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <span className="font-mono text-[11.5px] text-ink-3">
                  Transcript is scratch. Delete it when you are done.
                </span>
                <Button variant="danger-quiet" onClick={() => setConfirming('transcript')}>
                  Delete transcript
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-rule-strong bg-surface-2 p-6 text-center text-meta text-ink-2">
              {state === 'deleted'
                ? 'Deleted. The lesson, course and link are kept.'
                : 'No transcript. Distil from your own notes.'}
            </div>
          )}
        </section>

        <CoverageList sourceId={source.id} coverage={source.coverage} />

        {/* ── Distil ──────────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              Distil
            </span>
          </div>
          <div className="mb-7 flex flex-wrap gap-2.5">
            {/*
              A session of everything from one video, so "done with this video"
              is a state you reach rather than a feeling. `?scope=source` follows
              `?scope=weak` and `?scope=quiz` — same cap, same ordering, same
              waived floor because it is a set you chose.
            */}
            {entries.length > 0 ? (
              <Link
                href={`/practice?scope=source&id=${source.id}`}
                className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
              >
                Practise all {entries.length}
              </Link>
            ) : null}
            <Link
              href={`/library?add=1&source=${source.id}${selection ? `&definition=${encodeURIComponent(selection)}` : ''}`}
              className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              + Distil a topic
            </Link>
            <Link
              href={`/library?add=1&kind=quiz&source=${source.id}`}
              className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
            >
              + Distil a quiz
            </Link>
            <span className="self-center font-mono text-[11.5px] text-ink-3">
              Linked to this source automatically
            </span>
          </div>

          <div className="mb-2.5 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            From this source · {entries.length}
          </div>
          {entries.length === 0 ? (
            <p className="text-meta text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="list-none rounded-lg border border-rule bg-surface">
              {entries.map((entry) => (
                <li key={entry.id} className="border-b border-rule last:border-b-0">
                  <Link href={`/topic/${entry.id}`} className="flex items-center gap-3 px-[14px] py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-option text-ink">{entry.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                        {topicPath(entry)}
                      </span>
                    </span>
                    {entry.kind === 'quiz' ? <QuizBadge /> : null}
                    {/*
                      The loop closing: a source that produced a topic you now
                      grade weak is a video worth rewatching, and you can see
                      that without leaving the page. The only place in the
                      product where a source and a confidence appear together.
                    */}
                    <ConfidenceMeter confidence={entry.confidence} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 border-t border-rule pt-5">
            <Button variant="danger" onClick={() => setConfirming('source')}>
              Delete source
            </Button>
          </div>
        </section>
      </div>

      {editing ? (
        <SourceSheet source={source} siblings={siblings} onClose={() => setEditing(false)} />
      ) : null}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming === 'source' ? `Delete “${source.lesson}”?` : 'Delete this transcript?'
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Keep it</Button>
            <Button
              variant="danger"
              loading={isSaving}
              loadingLabel="Deleting…"
              onClick={() =>
                startSaving(async () => {
                  if (confirming === 'source') await removeSource(source.id)
                  else {
                    await removeTranscript(source.id)
                    setConfirming(null)
                    router.refresh()
                  }
                })
              }
            >
              {confirming === 'source' ? 'Delete source' : 'Delete transcript'}
            </Button>
          </>
        }
      >
        {/* The confirmation names what actually dies and what does not — the same
            rule the topic delete follows. */}
        <p className="text-body leading-[1.6] text-ink-2">
          {confirming === 'source' ? (
            <>
              This removes the source record and its transcript.{' '}
              <strong className="font-medium text-ink">{deleteCopy.kept}</strong>
              {deleteCopy.lost === '' ? '' : ` — ${deleteCopy.lost}`}. It can&rsquo;t be undone.
            </>
          ) : (
            <>
              The lesson, course and link are kept. Only the text you read from goes, and it
              can&rsquo;t be undone.
            </>
          )}
        </p>
      </Modal>
    </>
  )
}
