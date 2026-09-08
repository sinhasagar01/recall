/*
  No rail, no nav, no counts — the same reason `(practice)` has its own layout,
  and copied from it rather than invented: the room is a single focused card with
  nothing to click away to, and a sidebar reading "Weak topics 11" while you are
  being asked about one of them is exactly what a room must not have.

  `proxy.ts` guards the path, not the group, so this costs no auth work.

  ── data-mode is load-bearing ───────────────────────────────────────────────
  The interview scale is defined on `[data-mode='interview']` in globals.css and
  nowhere else. This attribute is what makes `bg-[var(--volt)]` resolve at all;
  outside this subtree the custom properties are undefined and the same class
  paints nothing. Removing it does not change a colour — it removes the whole
  scale, which is the point: the constraint is enforced by the cascade rather
  than by review.
*/
export default function InterviewLayout({ children }: LayoutProps<'/'>) {
  return (
    <div data-mode="interview" className="min-h-screen bg-bg">
      {children}
    </div>
  )
}
