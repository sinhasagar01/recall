'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildCleanLesson } from '@/app/(app)/learn/actions'
import { Button } from '@/components/ui/button'

export function LessonBuilder({ sourceId, words }: { sourceId: string; words: number }) {
  const router = useRouter(); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition()
  return <section className="rounded-lg border border-rule bg-surface p-5 shadow-card"><p className="text-body font-medium">Create a fresh version from this transcript</p><p className="mt-1 text-meta text-ink-2">{words.toLocaleString()} words · this replaces only this clean lesson. It never creates topics or quizzes.</p>{error ? <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-3 py-2 text-meta text-flag">{error}</p> : null}<div className="mt-4"><Button variant="primary" loading={pending} loadingLabel="Creating lesson…" onClick={() => startTransition(async()=>{setError(null); const result=await buildCleanLesson(sourceId); if(result.error){setError(result.error);return} router.refresh()})}>Create clean lesson →</Button></div></section>
}
