'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildCleanLesson } from '@/app/(app)/learn/actions'
import { Button } from '@/components/ui/button'

export function LessonBuilder({ sourceId, words }: { sourceId: string; words: number }) {
  const router = useRouter(); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition()
  return <section className="rounded-lg border border-rule bg-surface p-5"><p className="font-mono text-mono-sm tracking-[.12em] text-ink-3 uppercase">Lesson controls</p><p className="mt-2 text-body font-medium">Want a different explanation?</p><p className="mt-1 text-meta text-ink-2">Rebuild from the same {words.toLocaleString()}-word transcript. This replaces only the clean lesson—never Library items.</p>{error ? <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-3 py-2 text-meta text-flag">{error}</p> : null}<div className="mt-4"><Button variant="secondary" loading={pending} loadingLabel="Rebuilding lesson…" onClick={() => startTransition(async()=>{setError(null); const result=await buildCleanLesson(sourceId); if(result.error){setError(result.error);return} router.refresh()})}>Rebuild lesson</Button></div></section>
}
