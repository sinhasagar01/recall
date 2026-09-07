'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { Modal } from '@/components/ui/modal'
import { QuizBadge } from '@/components/ui/quiz-badge'
import { SourceSheet } from '@/components/sources/source-sheet'
import { removeSource, removeTranscript, toggleCaveat } from '@/app/(app)/sources/actions'
import { topicPath } from '@/lib/domain/library'
import {
  definitionFromSelection,
  extractionCount,
  extractionsFor,
  transcriptState,
  type Source,
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
 * ── Where arc 6 attaches ────────────────────────────────────────────────────
 * Two AI actions will live in these panel heads later: "find what I missed"
 * beside the extraction checklist, and "draft retrieval questions" beside the
 * quiz mode of the distil panel. The heads leave room for a single action button
 * each. Nothing is drawn, nothing is stubbed, and there is no disabled control —
 * a ghost button is worse than no button.
 *
 * The transcript stays reachable server-side for the same reason: both actions
 * will send it to a model from the server, so it must not exist only in browser
 * state, and the delete stays a deliberate act rather than something distilling
 * does for you.
 */
export function SourceWorkspace({ source, entries }: { source: Source; entries: Topic[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<'source' | 'transcript' | null>(null)
  const [selection, setSelection] = useState('')
  const [query, setQuery] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [isSaving, startSaving] = useTransition()

  const extractions = extractionsFor(source, entries)
  const done = extractionCount(source, entries)
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
            {source.title}
          </h1>
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
            {source.course ? `${source.course} · ` : ''}
            {state === 'present' ? `${source.transcript_words?.toLocaleString()} words · ` : ''}
            {done} of 5 extracted
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
                ? 'Deleted. The title, course and link are kept.'
                : 'No transcript. Distil from your own notes.'}
            </div>
          )}
        </section>

        {/* ── Distil ──────────────────────────────────────────────────────── */}
        <section>
          {/* Arc 6's "find what I missed" attaches to the right of this head. */}
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              Extracted from this source
            </span>
            <span className="font-mono text-[11.5px] text-ink-3">{done} / 5</span>
          </div>

          <ol className="mb-7 list-none rounded-lg border border-rule bg-surface">
            {extractions.map((extraction, index) => (
              <li
                key={extraction.kind}
                className="flex items-center gap-3 border-b border-rule px-[14px] py-3 last:border-b-0"
              >
                <span className="font-mono text-[11px] text-ink-3">{index + 1}</span>
                <span
                  aria-hidden="true"
                  className={`grid size-[15px] shrink-0 place-items-center rounded-full border text-[9px] text-white ${
                    extraction.done ? 'border-ok bg-ok' : 'border-dashed border-rule-strong'
                  }`}
                >
                  {extraction.done ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 text-option">{extraction.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{extraction.detail}</span>

                {/* The one manual item, labelled as the exception. Derived means
                    it cannot be gamed; this one is a tick and says so. */}
                {extraction.manual ? (
                  <Button
                    aria-label={extraction.done ? 'Untick when not to use it' : 'Tick when not to use it'}
                    onClick={() =>
                      startSaving(async () => {
                        await toggleCaveat(source.id, !extraction.done)
                        router.refresh()
                      })
                    }
                    disabled={isSaving}
                  >
                    {extraction.done ? 'Untick' : 'Tick'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>

          {/* Arc 6's "draft retrieval questions" attaches to the right of this head. */}
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              Distil
            </span>
          </div>
          <div className="mb-7 flex flex-wrap gap-2.5">
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

      {editing ? <SourceSheet source={source} onClose={() => setEditing(false)} /> : null}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming === 'source' ? `Delete “${source.title}”?` : 'Delete this transcript?'
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
              <strong className="font-medium text-ink">
                The {entries.length} {entries.length === 1 ? 'entry' : 'entries'} you distilled from
                it stay in your library
              </strong>{' '}
              — they lose the line saying where they came from. It can&rsquo;t be undone.
            </>
          ) : (
            <>
              The title, course and link are kept. Only the text you read from goes, and it
              can&rsquo;t be undone.
            </>
          )}
        </p>
      </Modal>
    </>
  )
}
