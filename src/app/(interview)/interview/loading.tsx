/** Interview has its own route group, so it needs its own route-level fallback. */
export default function InterviewLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-3xl py-10">
      <div className="animate-skeleton h-3 w-24 rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-4 h-10 w-2/3 rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-8 h-48 rounded-xl bg-surface-3" />
    </div>
  )
}
