/*
  Geometry matches the real rows, so nothing shifts when the data lands.

  This exists because without it Next leaves the PREVIOUS page on screen for the
  whole server render — click "Weak topics" and nothing appears to happen until
  the page swaps. That reads as slow however fast the query is, and the query
  here is a fraction of a millisecond.
*/
const ROW_WIDTHS = ['54%', '68%', '46%', '72%', '58%', '64%']

export default function WeakLoading() {
  return (
    <>
      <div className="mb-[22px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Weak topics</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">Loading what needs review…</p>
      </div>

      <ul className="overflow-hidden rounded-lg border border-rule bg-surface" aria-hidden="true">
        {ROW_WIDTHS.map((width, index) => (
          <li
            key={index}
            className="flex items-center gap-4 border-b border-rule px-[18px] py-[15px] last:border-b-0"
          >
            <div className="animate-skeleton h-3.5 w-[26px] shrink-0 rounded-sm bg-surface-3" />
            <div className="min-w-0 flex-1">
              <div className="animate-skeleton h-[17px] rounded-sm bg-surface-3" style={{ width }} />
              <div className="animate-skeleton mt-1.5 h-3 w-[42%] rounded-sm bg-surface-3" />
            </div>
            <div className="animate-skeleton h-[38px] w-[86px] shrink-0 rounded-md bg-surface-3" />
          </li>
        ))}
      </ul>
    </>
  )
}
