# Recall — design contract

`design-reference.html` is the visual source of truth. Open it, use the tab bar to
switch screens. Anything below that contradicts the HTML: the HTML wins.

Direction: **Ledger structure** (hairline rules, 6px radius, tight density, serif
titles) with an **indigo palette**.

---

## 1. Tokens

Put these in `globals.css` as CSS custom properties and map them into Tailwind
theme config. Do not hardcode hex values in components.

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#E9EAF0` | app background |
| `--surface` | `#FFFFFF` | cards, sheets, inputs, popovers |
| `--surface-2` | `#F5F5FA` | rail, chips, recall textarea, hover |
| `--surface-3` | `#EDEEF4` | skeletons |
| `--ink` | `#12131A` | primary text, filled confidence ticks |
| `--ink-2` | `#53555F` | body copy, secondary text |
| `--ink-3` | `#83858F` | mono labels, placeholders, meta |
| `--rule` | `#E1E1E9` | hairlines, card borders |
| `--rule-strong` | `#C9C9D4` | input borders, dashed states |
| `--accent` | `#3F3AC7` | primary action, mental-model rule, strong |
| `--accent-soft` | `#EDECFB` | mental-model panel, selected option, banner |
| `--accent-ink` | `#2E2A9E` | text on accent-soft, primary hover |
| `--flag` | `#B4325C` | weak confidence, destructive, errors |
| `--flag-soft` | `#FBEBF1` | error banners and panels |

`--flag` is the only alarm color. Never use it for anything that isn't weak
confidence, a destructive action, or an error.

### Type

| Role | Family | Where |
| --- | --- | --- |
| Display | `Newsreader` (serif) | topic titles, page titles, prompts, stat values |
| Body | `IBM Plex Sans` | definitions, descriptions, buttons, form labels |
| Utility | `IBM Plex Mono` | eyebrows, counts, chips, tags, meta, kbd hints |

The split is meaningful: serif = knowledge, sans = reading, mono = system.
Categories, counts and timestamps are system. Concepts are not.

Scale: page title 29px · detail title 34px · practice prompt 31px · card title
19px · body 14.5px · register body 15.5px · mental model 17.5px · mono utility
10.5–12px. Display weight 500, tracking −0.02em.

### Layout

| Token | Value | Use |
| --- | --- | --- |
| `--breakpoint-md` | `860px` | the single point where the layout goes mobile |

**`md:` in this codebase does not mean 768px.** Tailwind's default `md` breakpoint is
overridden to **860px** in the `@theme` block, because 860px is where
`design-reference.html` goes mobile (`@media (max-width:860px)`). Every responsive
utility in the app therefore flips at 860, all at once. Do not introduce a second
breakpoint: the rail, the card grid and the toolbar all change together or the layout
comes apart in the middle.

### Shape and depth

`--radius: 6px` · `--radius-lg: 10px` (cards, sheets, popovers, modals) ·
`--radius-sm: 4px` (listbox options). Two shadows only: `--shadow` for cards,
`--shadow-pop` for popovers and modals. Nothing else gets a shadow.

**Implementation note (phase 3).** Tailwind v4 is CSS-first and its `@theme`
namespaces have no bare keys, so two names differ from the table above:

| This document | `@theme` token | Utility |
| --- | --- | --- |
| `--radius` (6px) | `--radius-md` | `rounded-md` |
| `--shadow` | `--shadow-card` | `shadow-card` |

`--radius-sm`, `--radius-lg` and `--shadow-pop` keep their names. Everything else in
section 1 maps directly: colors become `--color-*`, families `--font-*`, and the type
scale `--text-*`.

---

## 2. Signature components

These three carry the product. Build them first, as primitives, before any page.

### ConfidenceMeter

Three ticks, filled by state. `new` = 0 filled, dashed borders. `weak` = 1 filled,
`--flag`. `okay` = 2 filled, `--ink`. `strong` = 3 filled, `--accent`.

Confidence is encoded by **fill count**, not hue. Only weak and strong carry
color. Never render this as red/amber/green — the library should not scold its
owner on every card.

Props: `confidence`, `showLabel`. Labels: `Never practiced` (not "New"), `Weak`,
`Okay`, `Strong`.

### The two registers

Definition and mental model must never look like two paragraphs of the same
thing. Definition: sans, 15.5px, `--ink`, max 66ch, no container. Mental model:
`--accent-soft` panel, 2px `--accent` left rule, serif, 17.5px, `--accent-ink`,
mono eyebrow in `--accent`.

This separation is the product. It appears on topic detail and on practice
reveal, identically.

### Kbd

A keycap: hairline `--rule` border with a 2px bottom edge, `--radius-sm`, mono
10.5px, `--ink-3`, `--surface` background. The heavier bottom edge on a small radius
is what makes it read as a key rather than a chip — keep both.

Used in Select's footer (`↑↓ move · ↵ select · Esc`) and the rail's keyboard hints.
Its absence from earlier drafts of this list was an omission in this document, not a
signal that it should be inlined.

### Select (listbox)

Not a native `<select>`. Trigger button + popover. Requirements:

- Trigger shows the current value; gets `--accent-soft` background and `--accent`
  border when set to anything other than "All"/"Any".
- Options carry a right-aligned count from the user's own data.
- Selected option: `--accent-soft` background, checkmark at left.
- Category variant adds a filter input and an `Suggested from your topic` group.
- Keyboard: `↑↓` move, `↵` select, `Esc` close, focus returns to trigger.
  `role="listbox"` / `role="option"` / `aria-selected` / `aria-expanded`.

Counts and grouping are the reason this isn't a native select. Keep them.

---

## 3. Screen and state inventory

Every row is a screen in `design-reference.html`. All 21 must exist in the build.

| Area | States |
| --- | --- |
| Auth | sign in · sign in with error · sign up · sign up submitting |
| Library | loaded · loading (skeleton) · empty · no search results · load error |
| Add topic | form · saving · success toast · image-failed partial success |
| Edit | form with existing image · replace/remove image · saved toast |
| Detail | full · visual lightbox · delete confirmation |
| Practice | recall · reveal + grade · session complete · too few topics |
| Weak | list · empty |
| Mobile | library · add (full screen) · practice (no tab bar) |

Skeletons must match real card geometry so nothing shifts when data lands.

---

## 4. Behaviour the mock encodes

1. **Skip in practice writes nothing.** No confidence change, no
   `practice_count`, no `last_practiced_at`.
2. **Grades persist on selection, not at session end.** Ending early keeps
   everything already graded. The mock says this in the UI; keep the line.
3. **Practice needs 3 topics**, with a visible "Practice the N anyway"
   override. A hard floor is not acceptable in a personal tool.
4. **Image failure never blocks the topic.** Insert the row, then upload, then
   patch the path. On upload failure the row stays and the banner explains the
   actual reason (size, type, network) — never a generic message.
5. **No-results offers `+ Add "<query>"`.** Searching for something absent is the
   most common moment you want to save it.
6. **Delete confirmation names what dies**, including the practice count.
   **The mock's wording here is illustrative, not literal.** It reads "This removes
   the topic, its mental model, its attached diagram, and 3 practice results" for
   every topic — but naming a diagram that is not attached, or a practice count that
   is zero, names something that does not die, which contradicts this very rule. The
   sentence is assembled from what the topic actually holds (`deletionSummary` in
   `src/lib/domain/library.ts`).

   **The same caution applies anywhere the mock hardcodes data-dependent copy**:
   counts, timestamps, category and confidence tallies, "N queued", "last practiced
   2 days ago". Those numbers are fixtures chosen to make a screenshot read well. The
   rule they illustrate is real; the values are not.
7. **Card shows `Model ✓`** when `mental_model` is non-empty. It's the strongest
   reason to open a card.
8. **Mobile has two destinations plus add.** Weak topics is a filter chip on
   Library, and the three filter selects collapse behind one `Filters` chip.

---

## 5. Copy rules

Sentence case everywhere. Active voice. An action keeps its name through the
whole flow — the button that says "Save topic" produces a toast that says
"Saved".

Prefer `Never practiced` to `Last practiced: Never`. Errors state what happened
and what to do; they never apologize and are never vague. Empty screens are
invitations, not apologies.

---

## 6. Accessibility floor

Not optional, not polish-phase:

- Visible focus ring on every interactive element (`--accent`, 2px, 2px offset).
- Listbox and modal keyboard support, focus trap in sheets and modals, focus
  restored on close.
- `prefers-reduced-motion` disables the skeleton pulse and the spinner
  animation.
- Practice grade buttons reachable by `1` / `2` / `3`.
- Color never carries meaning alone — confidence has a text label and a fill
  count; errors have an icon and text.

**The mock is not authoritative on field-error markup (phase 3).** `design-reference.html`
nests the error inside `<label class="field">`, which folds the error text into the input's
accessible name — a screen reader then reads the whole error as part of the field's label,
every time it is focused. The build instead uses an explicit `htmlFor`/`id` pair with the
error as a sibling of the input, wired with `aria-invalid` on the input,
`aria-describedby` pointing at the error, and `role="alert"` on the error so it is
announced when it appears. Visually identical to the mock; correct for assistive
technology. Where the two disagree, this is the rule.

---

## 7. Out of scope

The mock shows a few things beyond the original spec. Ship them only if the core
loop is done: search-term highlighting in card titles, "Review the 2 you missed"
on the session-complete screen, undo on the edit toast, per-option counts in the
difficulty select.
