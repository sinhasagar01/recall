export function RouteLoading({ label = 'Loading your workspace' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="max-w-[980px]">
      <div className="animate-skeleton h-3 w-[112px] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-4 h-10 w-[min(480px,82%)] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-3 h-4 w-[min(640px,94%)] rounded-sm bg-surface-3" />
      <div className="mt-8 rounded-lg border border-rule bg-surface p-6 shadow-card">
        <div className="animate-skeleton h-4 w-[32%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-6 h-4 w-full rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-3 h-4 w-[78%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-8 h-11 w-[142px] rounded-md bg-surface-3" />
      </div>
    </div>
  )
}
