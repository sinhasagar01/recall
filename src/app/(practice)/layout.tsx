/*
  No rail, no nav, no counts.

  Retrieval practice only works if there is nothing on screen to glance at that
  gives the answer away — and a sidebar showing "Weak topics 11" while you are
  trying to remember one of them is exactly that. `/practice` therefore sits in
  its own route group with its own layout. proxy.ts guards the path, not the
  group, so this costs no auth work.
*/
export default function PracticeLayout({ children }: LayoutProps<'/'>) {
  return <div className="mx-auto min-h-screen max-w-[720px] px-6 pt-[34px] pb-[70px]">{children}</div>
}
