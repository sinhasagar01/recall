/* The detail shell. Same reason as the other two: no boundary means no feedback. */
export default function TopicLoading() {
  return (
    <div aria-busy="true">
      <div className="animate-skeleton h-3 w-[132px] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-4 h-[30px] w-[62%] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-3 h-3 w-[180px] rounded-sm bg-surface-3" />

      <div className="mt-8 rounded-xl border border-rule bg-surface p-6">
        <div className="animate-skeleton h-3 w-[88px] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-4 h-4 w-full rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-2 h-4 w-[84%] rounded-sm bg-surface-3" />
      </div>

      <div className="mt-4 rounded-xl border border-rule bg-surface p-6">
        <div className="animate-skeleton h-3 w-[104px] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-4 h-4 w-full rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-2 h-4 w-[72%] rounded-sm bg-surface-3" />
      </div>
    </div>
  )
}
