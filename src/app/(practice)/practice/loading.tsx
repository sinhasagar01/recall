/*
  The session shell, without the card.

  A practice session is one query, but it also signs an image URL per topic that
  has one — so there is real work between the click and the first card. Holding
  the previous screen for that is what made practice feel slow to start.
*/
export default function PracticeLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-7 flex items-center justify-between gap-4">
        <div className="animate-skeleton h-3 w-[112px] rounded-sm bg-surface-3" />
        <div className="animate-skeleton h-3 w-[86px] rounded-sm bg-surface-3" />
      </div>

      <div className="rounded-xl border border-rule bg-surface p-7">
        <div className="animate-skeleton h-3 w-[74px] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-4 h-[26px] w-[68%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-6 h-[104px] rounded-md bg-surface-3" />
        <div className="animate-skeleton mt-5 h-[46px] w-[168px] rounded-md bg-surface-3" />
      </div>
    </div>
  )
}
