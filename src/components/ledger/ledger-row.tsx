'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { StatusDot } from '@/components/ledger/status-dot'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { changeStatus, removeItem } from '@/app/(app)/ledger/actions'
import { formatShortDate } from '@/lib/domain/library'
import { KIND_LABEL, STATUSES, deleteItemCopy, statusLabel, type ProjectItem } from '@/lib/domain/ledger'
import { useRouter } from 'next/navigation'

/**
 * A row IS the item.
 *
 * There is no ledger detail page: the title opens the link, and a page built to
 * display a title and a URL would be a place to look at a link instead of
 * following it. Storing the ADR's context, alternatives and consequences would
 * make this a document store, which is the decision already taken against.
 */
export function LedgerRow({
  item,
  capabilityName,
}: {
  item: ProjectItem
  capabilityName: string | null
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  const host = (() => {
    if (item.link === null) return null
    try {
      const url = new URL(item.link)
      return `${url.host}${url.pathname}`.replace(/\/$/, '')
    } catch {
      return item.link
    }
  })()

  return (
    <div
      data-testid="ledger-row"
      data-item-title={item.title}
      data-status={item.status}
      className="flex items-center gap-3.5 border-b border-rule px-[17px] py-3.5 last:border-b-0 hover:bg-surface-2"
    >
      <span className="w-[82px] flex-none rounded-[3px] border border-rule-strong bg-surface-2 px-1.5 py-[3px] text-center font-mono text-[9px] tracking-[0.12em] text-ink-3 uppercase">
        {KIND_LABEL[item.kind]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-[1.35] font-medium">
          {item.link === null ? (
            item.title
          ) : (
            /*
              rel="noreferrer noopener": these are URLs the user pasted, opened in
              a new tab. The parser already refused anything but http(s).
            */
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ink hover:underline hover:decoration-rule-strong"
            >
              {item.title}
            </a>
          )}
        </div>
        <div className="mt-[3px] flex flex-wrap items-center gap-x-2.5 gap-y-[3px] font-mono text-[10.5px] text-ink-3">
          <span>{formatShortDate(item.created_at)}</span>
          <span aria-hidden="true">·</span>
          {host === null ? (
            <span className="rounded-[3px] border border-dashed border-rule-strong px-1.5 py-[2px]">
              no link yet
            </span>
          ) : (
            <span className="truncate">{host}</span>
          )}
          {capabilityName ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                serves{' '}
                <Link
                  href={`/ledger?capability=${item.capability_id}`}
                  className="text-accent-ink underline hover:text-ink"
                >
                  {capabilityName}
                </Link>
              </span>
            </>
          ) : null}
          {item.note ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-ink-2">{item.note}</span>
            </>
          ) : null}
        </div>
      </div>

      <StatusDot kind={item.kind} status={item.status} />

      {/*
        Status is changed in place, from the row. A retired item stays exactly
        where it is, at its original date — a ledger that hides what you changed
        your mind about is not a record.
      */}
      <select
        aria-label={`Status of ${item.title}`}
        value={item.status}
        disabled={isPending}
        onChange={(event) =>
          startTransition(async () => {
            await changeStatus(item.id, event.target.value)
            router.refresh()
          })
        }
        className="flex-none rounded-md border border-rule bg-surface px-1.5 py-1 font-mono text-[10.5px] text-ink-2"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(item.kind, status)}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${item.title}`}
        className="flex-none cursor-pointer rounded-md px-1.5 py-1 font-mono text-[10.5px] text-ink-3 hover:text-flag"
      >
        Delete
      </button>

      {item.link !== null ? (
        <span aria-hidden="true" className="flex-none text-ink-3">
          ↗
        </span>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete “${item.title}”?`}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={isPending}
              loadingLabel="Deleting…"
              onClick={() =>
                startTransition(async () => {
                  await removeItem(item.id)
                  setConfirming(false)
                  router.refresh()
                })
              }
            >
              Delete entry
            </Button>
          </>
        }
      >
        {/*
          The confirmation's job here is to say what is NOT deleted. A ledger of
          links is the one place a delete is nearly free, and the sentence should
          say so rather than borrowing the gravity of deleting a topic.
        */}
        <p className="text-body leading-[1.6] text-ink-2">
          {deleteItemCopy(item.kind, item.link !== null)}
        </p>
      </Modal>
    </div>
  )
}
