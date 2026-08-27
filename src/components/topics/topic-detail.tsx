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

export function TopicDetail({
  topic,
  categories,
}: {
  topic: Topic
  categories: CategoryOption[]
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
          <Link
            href="/library"
            className="inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-label text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            ← Library
          </Link>
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
      <Definition>{topic.definition}</Definition>
      {topic.mental_model ? <MentalModel>{topic.mental_model}</MentalModel> : null}

      {/*
        Unreachable until phase 10: nothing can set mental_model_image_path yet,
        so this never renders today. `src` awaits the signed-URL read that phase 10
        adds to the data layer.
      */}
      {topic.mental_model_image_path ? (
        <RegisterSection title="Visual">
          <figure className="mt-2.5 overflow-hidden rounded-md border border-rule bg-surface-2">
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="block w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img src={topic.mental_model_image_path} alt="" className="w-full" />
            </button>
            <figcaption className="flex justify-between gap-2.5 border-t border-rule px-3 py-2 font-mono text-mono text-ink-3">
              <span>{topic.mental_model_image_path.split('/').pop()}</span>
              <span>Click to enlarge</span>
            </figcaption>
          </figure>
        </RegisterSection>
      ) : null}

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

      {topic.mental_model_image_path ? (
        <Lightbox
          open={zoomed}
          onClose={() => setZoomed(false)}
          src={topic.mental_model_image_path}
          alt={topic.mental_model_image_path.split('/').pop() ?? 'Diagram'}
        />
      ) : null}

      {saved ? <Toast message="Changes saved" /> : null}
    </article>
  )
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
