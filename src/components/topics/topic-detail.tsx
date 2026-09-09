'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { TopicSheet } from '@/components/topics/topic-sheet'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { Lightbox } from '@/components/ui/lightbox'
import { Modal } from '@/components/ui/modal'
import { Definition, MentalModel, RegisterSection } from '@/components/ui/register'
import { EvidenceSection } from '@/components/evidence/evidence-section'
import { TopicCapabilityLine } from '@/components/phases/topic-capability-line'
import type { Capability, Phase } from '@/lib/domain/phases'
import { TopicSourceLine } from '@/components/sources/topic-source-line'
import type { SourceSummary } from '@/lib/domain/sources'
import { takesEvidence } from '@/lib/domain/evidence'
import { Toast } from '@/components/ui/toast'
import { deleteTopic } from '@/app/(app)/topic/[id]/actions'
import { CONFIDENCE_LABEL } from '@/lib/domain/confidence'
import {
  deletionSummary,
  DIFFICULTY_LABEL,
  formatShortDate,
  type CategoryOption,
} from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'
import { BackToLibrary } from '@/components/ui/back-to-library'

export function TopicDetail({
  topic,
  categories,
  imageUrl,
  source,
  parent,
  sourceOptions,
  capability,
  capabilityOptions,
}: {
  topic: Topic
  categories: CategoryOption[]
  /** Signed during the server render, so it is present at first paint. */
  imageUrl: string | null
  /** Read separately: `source_id` is not on the domain Topic. */
  source: { source: SourceSummary; siblings: number } | null
  /**
   * The topic this one was saved out of, for a quiz kept during an interview.
   *
   * A prop for the third time and the same reason: `parent_topic_id` is
   * deliberately not on the domain Topic, so the practice queue has no way to
   * order by provenance. See topic-mapping.ts.
   */
  parent: { id: string; title: string } | null
  sourceOptions: { id: string; lesson: string }[]
  /** Read separately too: `capability_id` is not on the domain Topic either. */
  capability: { capability: Capability; phase: Phase } | null
  capabilityOptions: { phase: string; options: { id: string; name: string }[] }[]
}) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDeleting] = useTransition()

  const confirmDelete = () => {
    startDeleting(async () => {
      // Only returns on failure; on success it redirects to the library.
      const result = await deleteTopic(topic.id)
      if (result?.error) {
        setDeleteError(result.error)
        setConfirmingDelete(false)
      }
    })
  }

  return (
    <article className="max-w-[760px]">
      <header className="mb-7 border-b border-rule pb-5">
        <div className="mb-3.5">
          <BackToLibrary>← Library</BackToLibrary>
        </div>

        <h1 className="mb-3 font-display text-detail-title leading-[1.18] font-medium tracking-[-0.025em]">
          {topic.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {topic.category ? <Chip>{topic.category}</Chip> : null}
          {topic.tags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
          <span className="font-mono text-[11.5px] text-ink-3">·</span>
          <span className="font-mono text-[11.5px] text-ink-3">
            {DIFFICULTY_LABEL[topic.difficulty]}
          </span>
        </div>
      </header>

      {/* The same two components the phase 8 practice reveal imports. */}
      {/*
        A quiz has no definition — its question is the title above, and its options
        belong to practice rather than to a reading view. Omitted rather than
        rendered empty; e2e/quiz.spec.ts asserts the section is absent, because a
        blank Definition register is invisible to the compiler and looks almost right.
      */}
      {topic.kind === 'topic' ? <Definition>{topic.definition}</Definition> : null}
      {topic.mental_model ? (
        // "Why" is the word the add sheet uses for a quiz's explanation.
        <MentalModel label={topic.kind === 'quiz' ? 'Why' : 'Mental model'}>
          {topic.mental_model}
        </MentalModel>
      ) : null}

      {imageUrl !== null ? (
        <RegisterSection title="Visual">
          <figure className="mt-2.5 overflow-hidden rounded-md border border-rule bg-surface-2">
            <button
              type="button"
              onClick={() => setZoomed(true)}
              aria-label={`Enlarge ${imageName(topic)}`}
              /*
                The box is reserved by aspect-ratio, so decoding the image cannot
                shift the page either — the URL was already resolved server-side.
              */
              className="block aspect-16/9 w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img
                src={imageUrl}
                alt={imageName(topic)}
                className="size-full object-contain"
              />
            </button>
            <figcaption className="flex justify-between gap-2.5 border-t border-rule px-3 py-2 font-mono text-mono text-ink-3">
              <span>{imageName(topic)}</span>
              <span>Click to enlarge</span>
            </figcaption>
          </figure>
        </RegisterSection>
      ) : null}

      {/*
        Evidence sits between the mental model and the recall history, which is the
        reference's order: the claim about the rule, then the confidence detail it
        restates. Absent on a quiz — not empty. A quiz is a retrieval device, not a
        concept, and `topics_evidence_is_consistent` refuses the columns outright,
        so this branch and the database say the same thing.
      */}
      {/*
        One line, after the mental model and before Evidence. A topic with no
        source omits the section — the rule Definition and Visual already follow.
        It arrives as a prop rather than off the topic because `source_id` is
        deliberately not on the domain Topic; see topic-mapping.ts.
      */}
      {source ? <TopicSourceLine source={source.source} siblings={source.siblings} /> : null}

      {/*
        Where a quiz came from. The line is the whole point of `parent_topic_id`:
        without something reading it, the column would be write-only, which
        ARCHITECTURE.md records as a smell rather than a design.

        It disappears if the parent is deleted — the link is `on delete set null`,
        so the quiz survives and the line goes, which is the cascade direction
        chosen deliberately and proven in topics_test.sql.
      */}
      {parent ? (
        <p data-testid="from-topic" className="mt-3 text-meta text-ink-2">
          Saved from{' '}
          <Link href={`/topic/${parent.id}`} className="text-accent-ink underline">
            {parent.title}
          </Link>{' '}
          during an interview round.
        </p>
      ) : null}

      {/*
        After the source and before Evidence: where it came from, then what it is
        for, then what you have done with it. Arrives as a prop rather than off
        the topic because `capability_id` is deliberately not on the domain Topic;
        see topic-mapping.ts.
      */}
      {capability ? (
        <TopicCapabilityLine capability={capability.capability} phase={capability.phase} />
      ) : null}

      {takesEvidence(topic) ? <EvidenceSection topic={topic} /> : null}

      <RegisterSection title="Recall history">
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rule bg-rule">
          <Stat label="Confidence" testId="stat-confidence">
            <ConfidenceMeter confidence={topic.confidence} />
            {CONFIDENCE_LABEL[topic.confidence]}
          </Stat>
          <Stat label="Times practiced" testId="stat-practice-count">
            {topic.practice_count}
          </Stat>
          <Stat label="Last practiced" testId="stat-last-practiced">
            {formatShortDate(topic.last_practiced_at)}
          </Stat>
        </div>
      </RegisterSection>

      {deleteError ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
        >
          {deleteError}
        </p>
      ) : null}

      <div className="mt-[34px] flex items-center gap-2.5 border-t border-rule pt-5">
        {/* A deliberate single-topic session: not subject to the 3-topic floor. */}
        <Link
          href={`/practice?topic=${topic.id}`}
          className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
        >
          Practice this
        </Link>
        <Button onClick={() => setEditing(true)}>Edit</Button>
        <span className="flex-1" />
        <Button variant="danger-quiet" onClick={() => setConfirmingDelete(true)}>
          Delete
        </Button>
      </div>

      {/*
        Remounted per topic, so the prefilled fields come from state initialisers
        rather than an effect copying props into state after the fact.
      */}
      <TopicSheet
        sourceId={source?.source.id ?? null}
        sourceOptions={sourceOptions}
        capabilityId={capability?.capability.id ?? null}
        capabilityOptions={capabilityOptions}
        key={topic.id}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={setSaved}
        categories={categories}
        topic={topic}
      />

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={`Delete “${topic.title}”?`}
        footer={
          <>
            <Button onClick={() => setConfirmingDelete(false)}>Keep it</Button>
            <Button variant="danger" onClick={confirmDelete} loading={isDeleting} loadingLabel="Deleting…">
              Delete topic
            </Button>
          </>
        }
      >
        {/* Names what actually dies, built from what this topic actually holds. */}
        {deletionSummary(topic)}
      </Modal>

      {imageUrl !== null ? (
        <Lightbox
          open={zoomed}
          onClose={() => setZoomed(false)}
          src={imageUrl}
          alt={imageName(topic)}
        />
      ) : null}

      {saved ? <Toast message="Changes saved" /> : null}
    </article>
  )
}

function imageName(topic: Topic): string {
  return topic.mental_model_image_path?.split('/').pop() ?? 'Diagram'
}

function Stat({
  label,
  testId,
  children,
}: {
  label: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">{label}</div>
      <div
        data-testid={testId}
        className="mt-[5px] flex items-center gap-2 font-display text-card-title font-medium"
      >
        {children}
      </div>
    </div>
  )
}
