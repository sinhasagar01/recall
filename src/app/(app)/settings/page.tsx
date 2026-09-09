import Link from 'next/link'
import { ChangePassword } from '@/components/topics/change-password'
import { ExportButton } from '@/components/topics/export-button'
import { RegisterSection } from '@/components/ui/register'
import { BackToLibrary } from '@/components/ui/back-to-library'

/*
  Two things. Nothing else.

  ── What this is composed from ──────────────────────────────────────────────
  design-reference.html has no settings screen, so nothing here is read off it
  directly. Rather than invent a visual pattern for a page holding two controls,
  it reuses what other screens already are:

    * the page head — h1 at `text-page-title` with a mono subtitle — is the same
      one the library and the weak page use
    * RegisterSection is the topic detail page's own sectioning: a mono uppercase
      eyebrow above a block of content
    * Field and Button are the sign-in and sign-up screens' primitives

  So it looks like the product because it is made of the product.

  There is deliberately no theme control (the design is light-only — dark mode
  appears nowhere in DESIGN.md or the reference), no profile fields, and no
  placeholder sections for things that do not exist yet.
*/
export default function SettingsPage() {
  return (
    <>
      <div className="mb-[22px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Settings</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">
          Your password, and a copy of everything you&rsquo;ve saved
        </p>
      </div>

      <div className="max-w-[560px]">
        <RegisterSection title="Password">
          <p className="mt-2 text-body text-ink-2">
            Changing it needs the current one. Without that, anyone at an unlocked laptop
            could take the account rather than merely borrow it.
          </p>
          <ChangePassword />
        </RegisterSection>

        <RegisterSection title="Export">
          <p className="mt-2 text-body text-ink-2">
            Every topic you&rsquo;ve saved, as a zip: a readable{' '}
            <code className="font-mono text-mono-sm">library.md</code>, a complete{' '}
            <code className="font-mono text-mono-sm">library.json</code>, and your images.
            Nothing here depends on Recall still existing.
          </p>
          <ExportButton />
        </RegisterSection>

        {/*
          The way back. Every route in the (app) group offers one — e2e/wayfinding.spec.ts
          asserts it — and this page has no rail on mobile to fall back on.
        */}
        <BackToLibrary />
      </div>
    </>
  )
}
