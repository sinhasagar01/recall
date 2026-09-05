'use client'

import { useState, useTransition } from 'react'
import { deleteAccount } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { accountDeletionSummaryFromCounts } from '@/lib/domain/account'

/**
 * Deleting an account is irreversible and reaches storage the database cannot,
 * so the confirmation names what actually dies — counted from the real library,
 * not from fixed copy.
 */
export function DeleteAccount({ topics, images }: { topics: number; images: number }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, startDeleting] = useTransition()

  const confirm = () => {
    setError(null)
    startDeleting(async () => {
      // Only returns on failure; on success it redirects to sign-in.
      const result = await deleteAccount()
      if (result?.error) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="cursor-pointer rounded-md text-left text-option text-ink-3 hover:text-flag"
      >
        Delete account
      </button>

      {error ? (
        <p role="alert" className="mt-2 font-mono text-[11.5px] text-flag">
          {error}
        </p>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep my account</Button>
            <Button
              variant="danger"
              onClick={confirm}
              loading={isDeleting}
              loadingLabel="Deleting…"
            >
              Delete everything
            </Button>
          </>
        }
      >
        {accountDeletionSummaryFromCounts(topics, images)}
      </Modal>
    </>
  )
}
