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
| `--ok` | `#1B6B4F` | a quiz's correct option, and nothing else |
| `--ok-soft` | `#E6F2EC` | the panel behind it |

`--flag` is the only alarm color. Never use it for anything that isn't weak
confidence, a destructive action, or an error.

`--ok` is the only green in the product, and it exists for one reason: a quiz's
answer is **objective**. Everywhere else the app deliberately refuses to grade —
confidence is drawn in ink and accent, never red/amber/green, because "the library
should not scold its owner on every card". A quiz is the one place where the app
knows you were right, so it is the one place a green is honest. Using it anywhere
else re-introduces the scolding this palette was built to avoid.

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

A quiz has no definition, and its Why renders in the mental-model register — same
panel, same serif, same rule. The eyebrow is the one thing that changes: "Why" on a
quiz's detail page, and **no eyebrow at all** on the practice screen, where the
explanation sits directly under the marked options and a heading would only separate
them. One field, one register, one voice; the label follows what was typed into it.

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

Every row is a screen in `design-reference.html`. **The tab bar carries 20**, and all
20 must exist in the build. (An earlier draft of this document said 21; the count was
wrong, not the reference.)

| Area | States |
| --- | --- |
| Auth | sign in · sign in with error · sign up · sign up submitting |
| Library | loaded · loading (skeleton) · empty · no search results · load error |
| Add topic | form · saving · success toast · image-failed partial success |
| Edit | form with existing image · replace/remove image · saved toast |
| Detail | full · visual lightbox · delete confirmation |
| Practice | recall · reveal + grade · session complete · too few topics |
| Weak | list · empty |
| Quiz (`quiz-reference.html`) | add · library card · practice: unanswered · focus · selected · wrong · right · two-option · no quizzes |
| Mobile | library · add (full screen) · practice (no tab bar) |

Skeletons must match real card geometry so nothing shifts when data lands.

---

## 4. Behaviour the mock encodes

*Cross-references name a rule rather than numbering it — `DESIGN.md, "Mobile has two
destinations plus add"`, not `section 4.12`. Inserting a rule renumbers every rule
after it, and those numbers were chased through code comments four times before this
note existed. The bolded phrase opening each rule is its name.*


1. **Skip in practice writes nothing.** No confidence change, no
   `practice_count`, no `last_practiced_at`.
2. **Grades persist on selection, not at session end.** Ending early keeps
   everything already graded. The mock says this in the UI; keep the line.
3. **Practice needs 3 topics**, with a visible "Practice the N anyway"
   override. A hard floor is not acceptable in a personal tool.

   **A session is `PRACTICE_SESSION_SIZE` topics, from every entry point.**
   "Practice all" on the weak page used to queue everything that needed review —
   the one door that ignored the session size. Ten at a time is what a session has
   always meant, so the button says what it does: `Practice all 7` while the
   backlog fits a session, `Practice 10 of 47` once it does not. The count stays
   either way, because seeing how much is waiting is half the point of the button.

   The 3-topic floor still does not apply to it, or to "Practice this" from a
   topic: those are sets you chose, and the floor exists to stop an *auto-selected*
   session from being re-reading the same card.
4. **Image failure never blocks the topic.** Insert the row, then upload, then
   patch the path. On upload failure the row stays and the banner explains the
   actual reason (size, type, network) — never a generic message.
5. **Search is instant up to 500 topics, and a round trip past that.** Under the
   threshold the whole library is in the browser and narrowing is a re-render, with
   no request. Past it the query goes to the database, debounced so it runs once
   typing settles, and the results dim while it does — stale rows must not read as
   current ones. The counts follow the list across that boundary: whichever mode is
   in use produces both, never one of each.
6. **No-results offers `+ Add "<query>"`.** Searching for something absent is the
   most common moment you want to save it.
7. **The weak page asks two questions.** What needs review, and what has settled
   but gone quiet — `okay` or `strong`, and not practised in 60 days. Confidence
   does not decay, so the first list empties permanently once everything has been
   graded; the second is what the page has to say in month two. The stale copy is
   a question, not a verdict: the grade stays as you left it.

   **The rail badge counts only the first.** Folding stale topics into the flag
   number would make one number mean two things, and make it grow while you have
   done nothing wrong.

8. **Delete confirmation names what dies**, including the practice count.
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
9. **Card shows `Model ✓`** when `mental_model` is non-empty. It's the strongest
   reason to open a card.
10. **The rail is sticky; the reference does not say so.** From `md` up it holds
    at the top of the viewport at `h-screen`, with `self-start` so the grid does
    not stretch it (a stretched rail is as tall as the page, and `top-0` then has
    nothing to hold), `overflow-y-auto` for the day its own content is taller than
    the viewport, and the foot's `margin-top:auto` pinning sign out and the hints
    to the bottom of the viewport.

    **This is a decision taken here, not a rule read off the reference.**
    `design-reference.html` renders `.rail` as a plain grid column and says nothing
    about stickiness — its screens are short enough that the question never arises
    in them. What it does specify is the composition: the flex column, the 26px
    gap, and `.rail__foot{margin-top:auto}`. Those were already matched and are
    unchanged.

11. **Settings holds two things and lives in the account foot.** Changing a
    password while signed in, and export. Nothing else — no theme (the design is
    light-only), no profile fields, no placeholders for what does not exist.

    It is **not** a nav destination. It sits beside Sign out in the rail foot, and
    beside Sign out in the library head on mobile, because that is where the
    account surface already is. A fourth nav entry would break the next rule.

    **The reference has no settings screen**, so nothing here is read off it. The
    page is composed from what other screens already are: the library's page head,
    the topic detail page's `RegisterSection`, and the auth screens' Field and
    Button. No new visual pattern for a page holding two controls.

    **Changing a password requires the current one.** Supabase would accept the
    change on session validity alone; that would make an unlocked laptop an
    account takeover rather than a nuisance, since whoever set the new password
    keeps access after the laptop is locked and the owner does not. Being a
    single-user tool argues for this, not against it — there is no administrator
    and no second factor, only the emailed reset link.

12. **Difficulty is set on edit, not at capture.** The add sheet does not ask for
    it; a new topic takes the column default. The edit sheet does, and the toolbar
    filter is unchanged.

    Nothing reads it when choosing what to practise — the queue orders by
    confidence bucket then staleness, and `difficulty` appears nowhere in
    `practice-selection.ts`. Asking for it while saving charged a decision at the
    moment that most needs to be cheap, for a field the product then ignored.
    `confidence` already answers "how hard is this for me", and answers it from
    what happened rather than from a guess made before you had tried.

    **This diverges from the reference, which shows the control on both sheets**
    (`design-reference.html`, the `add` and `edit` screens). The column stays, so
    the decision is reversible by putting the control back.

13. **Mobile has two destinations plus add.** Weak topics is a filter chip on
   Library, and the three filter selects collapse behind one `Filters` chip.

**The library is one list, newest first.** `design-reference.html` draws a "Recently
learned" section below the grid, and the build shipped it: everything else in one grid,
a divider, then what arrived inside `RECENT_WINDOW_DAYS` in a second. **Removed.** Two
visually identical grids do not read as two sections — on a 29-topic library a topic saved
five seconds earlier sat at position 24, which reads as "my new topic is at the bottom".
The recency information survives where it always belonged, on the card: a relative
timestamp appears while a topic is inside the recent window, in both reading modes, marked
through the same `recently-added` predicate the chip and its count already use, so the
three cannot disagree about what "recent" means. The ordering is now one sentence —
newest first, full stop — and the mock does not win this one.

---

## 5. Quizzes

A second content type in the same table, discriminated on `kind`. Specified by
`quiz-reference.html`, which **supersedes any earlier quiz mock**.

### How `quiz-reference.html` is read

`design-reference.html` predates the build and specifies things the code has not caught
up to. `quiz-reference.html` is the opposite: it was drawn after twelve phases and can
contradict decisions already shipped. So it is read under a precedence rule:

> **The screens win on visual and interaction detail. A shipped decision with recorded
> reasoning wins over the screens. Any other conflict of that kind stops for a decision
> rather than being resolved by following the drawing.**

Two conflicts of that kind, both resolved:

- **Difficulty on the add form.** The reference draws a difficulty select on the quiz add
  sheet. It was drawn without tracking that the difficulty field had already been removed
  from capture — practice ordering reads confidence and staleness and **never** difficulty,
  so asking at capture is a decision nothing acts on. Neither shape asks at capture; both
  set it on edit. The build stands, the drawing does not.
- **"Practised" vs "practiced".** The reference is British; the build ships
  `CONFIDENCE_LABEL.new = 'Never practiced'` and is overwhelmingly American in user-facing
  copy. New quiz copy follows the build. Recorded so it is not read as an oversight.

### What a quiz is

A hand-written question, 2+ options, exactly one correct, and an explanation. Independent
of topics — not generated from them, not attached to them. **No AI anywhere.**

- The **question** is the `title`. There is no definition field; the card and the detail
  page show the question where a topic shows its name.
- The **Why** reuses `mental_model`. It does the same job — not what the answer is, but
  why — so it gets the same field, the same indigo register and the same voice. It is
  labelled "Why" on a quiz and "Mental model" on a topic; the panel is identical.
- **No image.** A quiz that needs a diagram is a topic. Enforced by the database, not
  only by the form.
- Required to save: question, 2+ options, a marked answer, and the Why. The first three
  are database constraints; the Why is a form rule, so a quiz arriving by another path is
  not rejected for it.

### Answering: select, then Check

**A tap never writes.** Selection is local; the database write happens on Check. A
mis-tap on a phone must not be able to mark something weak for good, and you can change
your pick as often as you like until you commit.

Before Check, the selected option is **accent** — the same colour every selected thing in
the app uses, deliberately not green or red. The app is not hinting at whether you are
right.

After Check, **exactly two options are marked**: the correct one, and your pick if it was
wrong. Everything else goes muted grey. Painting every wrong option red buries the one
that matters. The **two-option case** is the shape with no quiet third — both options
carry a mark and the muting rule has nothing to apply to — so it was built first, and the
muting rule itself is asserted against a three-option quiz because two options cannot
express it.

The options **stop being buttons** after Check: same shape so nothing shifts, but no
hover, not focusable, and not announced as controls. A disabled button still says
"button".

Colour never carries the outcome alone. Every marked option has a glyph and a text tag
("The answer", "You picked this", or "Correct · you picked this" — one tag, not two), and
the verdict line pairs the `ConfidenceMeter` with the words "Marked weak" / "Marked
strong" inside an `aria-live` region.

`1`–`9` select by **displayed** position, `Enter` checks and then continues, `Esc` leaves.
All inert while the caret is in a field.

### Options shuffle per session

With the same seeded shuffle practice ordering uses, keyed by the read timestamp and the
quiz id. Otherwise by the third round you are recalling "the second one" rather than the
answer. Stable within a session so a re-render cannot reshuffle mid-question, and **stored
order everywhere else** — the export renders options as stored, because the shuffle is a
property of a session, not of the quiz.

### Grading is objective, and has two outcomes

Correct → strong. Incorrect → weak. **A quiz can never land on `okay`**, and this is its
own function (`gradeQuiz`) rather than a reuse of `GRADE_TO_CONFIDENCE`: sharing the
three-way map is precisely what would make "partly" reachable for something that has no
partly.

Everything downstream is shared and unforked. `isNeverPracticed`, `needsReview`,
`orderForPractice` and `isStale` were already written against fields both shapes have, so
none of them changed.

### A session holds both shapes

The default session mixes quizzes and topics, and `/weak` lists them together. This is
load-bearing rather than incidental: confidence is one system, so a quiz that could not
appear in the default session would only resurface when you went looking for it — a thing
the product knows you are weak at and never brings you. `?scope=quiz` is the separation;
excluding quizzes from the default session would have been a leak wearing separation's
clothes.

Because a session can now hold both, two pieces of copy changed:

- The progress dots are labelled **"Card N of M"**, not "Topic N of M".
- The session-complete screen's three columns read **Weak / Okay / Strong**, not "Didn't
  know / Partly / Knew it". A quiz makes no self-assessment, so the grade screen's words
  do not describe what happened to it — and the confidence words are the ones the
  `ConfidenceMeter`, the library chips and the weak page already use. The tally now names
  the thing that was actually recorded, in the vocabulary the rest of the app already
  reads in.

### The weak page gets no type chips — deliberately

It answers *what do I not know*, and shape is not part of that question. All / Topics /
Quizzes there would invite narrowing a list whose whole point is that confidence is one
system regardless of shape.

The mixing stays legible without chips: the Quiz badge and the left accent rule mark a
quiz at a glance, exactly as on the library card. And the action someone actually wants on
noticing the mix — *drill only the quizzes* — already exists as `?scope=quiz` rather than
as a filter that only re-sorts what they are looking at.

Stated as a not-yet rather than a never. `LibraryCounts.byKind` exists for the library's
chips, so if the mixed list does feel wrong in use, adding them there is small.

### Adding one: the type toggle

The existing Add/Edit sheet gains a Topic/Quiz toggle at the top — one sheet, four
modes, the same way edit mode already reuses it rather than forking a second. Switching
swaps three things and hides one:

| | Topic | Quiz |
| --- | --- | --- |
| First field | Topic (one line) | Question (a textarea — a question is a sentence, not a name) |
| Body | Definition | Options, 2+, one marked |
| Indigo field | Mental model · *how you think about it* | Why · *shown after you answer*, and required |
| Image | yes | absent |

Switching keeps what you have typed: definition and options are held separately, so
flipping to Quiz and back does not lose a half-written definition, and a mistaken tap on
the toggle is not destructive. An **edit** can change the kind too — the write always
carries both shapes' columns with one side nulled, because switching has to clear what no
longer applies or the shape constraint rejects it.

**Nothing is marked as the answer by default.** A pre-checked first option would let a
distracted save record the wrong answer, and the quiz would then look entirely normal
until it marked you wrong for being right. The radios carry `required` so the browser
refuses the submit; the same rule is enforced again in the domain parser, because an
action is reachable without a form and an unmarked `correct_option` arrives there as an
empty string — which `Number('')` would have turned into a valid index of 0.

An empty option is **reported, not dropped**. Dropping one would shift every option after
it and silently move the marked answer.

### The type chips

All / Topics / Quizzes lead the library's chip row, mutually exclusive, with All as the
absence of the filter rather than a third value. Counts come from `LibraryCounts.byKind`,
produced by the domain in local mode and by `library_counts` in SQL past the threshold —
the same pair the parity harness holds to agreement, so a chip cannot claim a number that
clicking it would not yield. The filter lives in the URL like every other one, so a
filtered view is shareable and survives a reload.

### In the export

`library.json` carries `kind`, `options` and `correct_option` like every other column.
`library.md` renders the question as the heading, an `## Options` list in stored order
with `← the answer` beside the correct one, and `## Why`. The answer is marked **in
words** because the file has to be readable with no tooling at all — a bold entry or a
colour is a convention the reader has to already know, and an index would have to be
resolved against a list that renumbers when rendered. The count at the top of the file
names both shapes ("12 topics and 3 quizzes"), never calling everything a topic.

---

## 6. Copy rules

Sentence case everywhere. Active voice. An action keeps its name through the
whole flow — the button that says "Save topic" produces a toast that says
"Saved".

Prefer `Never practiced` to `Last practiced: Never`. Errors state what happened
and what to do; they never apologize and are never vague. Empty screens are
invitations, not apologies.

---

## 7. Accessibility floor

Not optional, not polish-phase:

- Visible focus ring on every interactive element (`--accent`, 2px, 2px offset).
- Listbox and modal keyboard support, focus trap in sheets and modals, focus
  restored on close.
- `prefers-reduced-motion` disables the skeleton pulse and the spinner
  animation.
- Practice grade buttons reachable by `1` / `2` / `3`; a quiz's options by `1`–`9`
  with `Enter` to check and then continue. `Esc` leaves a session at any point. The session has no rail, so its exit is the only way back and has
  to be a visible control rather than a word in the meta line.
- The rail's `N` / `/` / `P` hints are real shortcuts, not decoration. Every one is
  inert while the caret is in a field.
- Color never carries meaning alone — confidence has a text label and a fill
  count; errors have an icon and text; a checked quiz option has a glyph and a text
  tag, and the verdict is announced through `aria-live`.

**The mock is not authoritative on field-error markup (phase 3).** `design-reference.html`
nests the error inside `<label class="field">`, which folds the error text into the input's
accessible name — a screen reader then reads the whole error as part of the field's label,
every time it is focused. The build instead uses an explicit `htmlFor`/`id` pair with the
error as a sibling of the input, wired with `aria-invalid` on the input,
`aria-describedby` pointing at the error, and `role="alert"` on the error so it is
announced when it appears. Visually identical to the mock; correct for assistive
technology. Where the two disagree, this is the rule.

---

## 8. Out of scope

The mock shows a few things beyond the original spec. Ship them only if the core
loop is done: search-term highlighting in card titles, "Review the 2 you missed"
on the session-complete screen, undo on the edit toast, per-option counts in the
difficulty select.
