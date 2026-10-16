/** Shared immediate feedback for private screens without a route-specific shell. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <div className="animate-skeleton h-3 w-[104px] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-4 h-9 w-[min(420px,78%)] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-3 h-4 w-[min(560px,92%)] rounded-sm bg-surface-3" />
      <div className="mt-8 rounded-xl border border-rule bg-surface p-6">
        <div className="animate-skeleton h-4 w-[38%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-5 h-4 w-full rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-3 h-4 w-[84%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-7 h-11 w-[132px] rounded-md bg-surface-3" />
      </div>
    </div>
  )
}
