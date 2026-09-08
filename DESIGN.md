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

`--ok` is the only green in the product, and it exists for one reason: the thing it
marks is **binary** — a quiz's answer is right or it is not, and a piece of evidence
is recorded or it is not. Everywhere else the app deliberately refuses to grade —
confidence is drawn in ink and accent, never red/amber/green, because "the library
should not scold its owner on every card". These are the two places where the app knows a
fact rather than holding an opinion, so they are the two places a green is honest. Using it anywhere
else re-introduces the scolding this palette was built to avoid. **Never for
confidence**, which is a judgement rather than a fact, and the one thing this palette
refuses to colour-code.

`--flag` has one further case, and it is deliberately narrow: **a stale source's yield
label** — "Nothing · 15 days" on a source that has produced nothing in a fortnight. The
label takes the colour; **the row does not**. A crimson row would read as an error, and a
stale source is not an error, it is a fact about you. `sources-reference.html` argued for
the row without checking this rule and has been corrected. Nowhere else.

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

## 6. Evidence on a topic

Four markers. **Recall is derived** from confidence and is never stored or edited here;
**Rebuild, Challenge and Production** are each absent, or present with a date, a required
note and an optional URL. Specified by `evidence-reference.html`.

**It encodes one sentence, and the sentence is on screen.** *"Weak until you can explain
it, implement a variant, and use it in a design decision."* It sits above the row in the
product, because without it the row is four checkboxes with no reason.

**Recall appears twice, deliberately.** The first cell restates the confidence the meter
already shows, and the Recall history section below still shows it. A rule with a hole in
it reads as three unrelated checkboxes.

**An ADR is a URL.** The link field is the entire integration with any document, PR or
diagram. The product stores no documents.

**It never touches practice.** Evidence is not an input to practice selection, ordering,
the weak page, or any count. Asserted in four places, one of which reads the source of the
queue modules and fails on the mere mention of a column name.

**It never appears on a quiz.** A quiz is a retrieval device, not a concept. The section is
**absent, not empty**, and the shape constraint refuses the columns outright.

**No completion state.** No badge, no celebration, no "complete". Four ticks are the whole
signal. And no scheduling of any kind — that cadence runs manually, outside the app.

### Three squares on a card, and the right slot holds one thing

The card foot's right slot shows the **evidence squares** when a topic has any, **Model ✓**
when it has none, and **Practiced N×** on a quiz. Never two of them, never four squares —
the meter already carries Recall.

An early draft of `evidence-reference.html` drew its cards with no `Model ✓` at all. **That
was an oversight in the drawing, not a decision to delete a shipped element**, and the
reference now says so in its rules tab. The fallback is the rule; the drawing is not.

Separately, and *not decided here*: `Model ✓` currently appears on 26 of 26 topics, so it
discriminates nothing. That is its own decision and TASKS.md records it as an open
question.

### Colour is never the only signal

Every cell carries a tick or a dashed circle, a label and text, so done and not-yet read
differently in greyscale. Four cells become two by two below `--breakpoint-md`, and the
per-cell Record buttons — revealed on hover and on **focus-within**, never `display:none`,
which would take them out of the tab order — collapse into one button that asks which kind
first. Three hover-revealed buttons do not survive a touch screen, and four tap targets
across 390pt would each be under 44px.

---

## 7. Sources

`sources-reference.html` is the visual source of truth for this section, read the way
`design-reference.html` is: the screens win on visual and interaction detail, and a
shipped decision with recorded reasoning wins over the screens.

A source is the video or article a topic came from — **title required, course and URL
optional, transcript optional and deletable**. The transcript is scratch you work from,
never a library of its own.

### A source is never practised

It has no confidence, never enters the practice queue, and never appears on the weak page.
This is the failure mode the whole section is built against: the moment the queue can see
a `source_id`, a transcript is one join away from being something you are asked to recall.
It is enforced structurally rather than by care — `source_id` is deliberately absent from
the domain `Topic`, so a queue module has no column to name. See ARCHITECTURE.md.

### The transcript is never searched from the library

Library search reads `search_text`, which is generated on `topics`; a transcript is not in
that table, so it cannot be found there. Inside a source's own workspace it **is**
searchable, client-side over text already on screen. There is deliberately no server-side
way to search a transcript, because that machinery is what someone would later reuse to
"just also search transcripts", and a transcript matching a word would bury the topic you
wrote about it under the paragraph that taught it to you.

### Selecting transcript text fills the definition, never the mental model

Someone else's words are fine for the fact. The mental model is the correction only you
can write, and a prefilled one would be a quotation pretending to be understanding. The
domain function returns a definition and has no field to put a model in, so there is no
path from a selection to that input.

### Four of the five extractions are derived

A definition, a mental model, a challenge attempted, and three retrieval questions all come
from what is linked to the source. Only **"when not to use it"** is a stored tick, because
nothing in the data distinguishes that topic from any other — and the UI labels it as the
exception. Derived means it cannot be gamed: you cannot claim three retrieval questions
with two quizzes written, in the same way you cannot claim a capability by finishing a
video.

### Deleting

Two different deletions, and the copy distinguishes them because the data does. Deleting
the **transcript** keeps the record: *"Deleted. The title, course and link are kept."*
Deleting the **source** keeps its topics — `on delete set null`, so the entries stay and
lose the line saying where they came from, and the confirmation says exactly that. A
source that never had a transcript reads *"No transcript. Distil from your own notes"*,
which is why `transcript_deleted_at` exists at all.

### On a phone

Sources is reached from the **account surface beside Settings**, not from a fourth tab
entry: the tab bar stays two destinations plus add (rule 13, above). Note that the account
foot in the desktop rail is not that surface — the whole rail is `hidden` below
`--breakpoint-md`, so the mobile account surface is the `md:hidden` cluster in the library
head, where Settings and Sign out already live. The workspace stops being two columns: the
transcript collapses behind Show, and select-to-fill is not offered, because text selection
on a touch screen fights the browser's own selection UI. On a phone you read and type.

### In the export — the one stated exception

`library.json`'s promise is "every column, not a summary". **Transcript bodies are the
exception, and both files say so.** Each source exports its whole record plus
`transcript_words`; `library.md` gains a *"Where this came from"* line per topic and a
`# Sources` section, and states in the file that transcript text is deliberately not
exported and why.

The reason: the export's promise is that your **library** survives Recall, and a transcript
is explicitly the thing the product tells you to delete — third-party text pasted as
scratch. Shipping megabytes of it in a file meant to be readable is a cost paid on every
export for material you are asked to throw away.

The word count is exported precisely so the omission is legible: a reader finding a source
with a count and no text can tell that was a decision rather than a bug. Asserted twice —
that the rendered file carries the count and not the body even when handed one, and that
the export query never selects the body in the first place, which is what protects
`library.json`, since it is serialised straight from the query result.

---

## 8. Phases and capabilities

`phases-reference.html` is the visual source of truth, read the way the others are:
the screens win on visual and interaction detail, and a shipped decision with recorded
reasoning wins over the screens.

A phase is a stretch of weeks and the handful of things you will be able to do at the end
of it. A capability is one of those things, **written as an ability** — "Explain the event
loop without notes", not "Event loop".

### A capability is demonstrated, never ticked

Two halves, both required: **something linked is at okay or better on recall**, and
**something linked carries rebuild, challenge or production evidence**. Recall plus a
rebuild, challenge or capstone decision.

The box has no click handler, and there is no column behind it — `phases_test.sql` asserts
the exact column set of both tables so a stored `demonstrated` cannot be added quietly. A
course ending changes nothing here, and neither does your opinion of yourself on a good
day.

The evidence half only counts **topics**. A quiz can be linked and can satisfy the recall
half; it can never satisfy the evidence half, because a quiz is a retrieval device rather
than something you build with.

### An undemonstrated capability says which half is missing

*"You can say it, but you have not built with it"* and *"You have built with it, but you
cannot say it cold"* are **opposite instructions**, and a bare unchecked box gives neither.
The sentences live in the domain beside the rule that produces them, so the two cannot
drift. A capability with nothing linked gets no diagnosis — the evidence line already says
"nothing linked", and there is nothing yet to diagnose.

### Colour

`--ok` marks demonstrated. It is the third place this product uses green and it belongs to
the same rule as the first two: the thing it marks is **binary and derived from facts**. A
quiz's answer is right or it is not, a piece of evidence is recorded or it is not, and a
capability's two halves are both true or they are not. None of them is an opinion.

`--flag` appears in exactly one place on this screen: **"at weak" and "all weak or new"**,
which *are* weak confidence, the first case the rule already names. "No rebuild, challenge
or production" and "nothing linked" are **absences, not errors**, and take ordinary meta
ink. `phases-reference.html` drew all four in crimson and has been corrected. The rule is
not widened.

### A phase is current when it is the earliest not fully demonstrated

Derived, never stored, and never a date. It changes when evidence changes and at no other
time — nothing on this screen moves because a week passed. A phase with no capabilities
counts as unfinished: you have arrived and not yet written down what you are there to
learn. If every phase is fully demonstrated, none is current.

### "When" is free text

Never a date, never parsed, never compared to today. A date would let the product work out
that you are behind, and it is not going to do that. There is no date arithmetic anywhere
in this feature, and the column is `text` with a pgTAP assertion holding it there.

No percentage, no burn-down, no week counter. "2 of 4" is a count you can click through to,
which is the only kind of number this product carries.

### Deleting

Deleting a phase **deletes its capabilities and keeps every topic** — `on delete cascade`
one way, `on delete set null` the other, in the same migration. The confirmation names
both, and its sentence is built in the domain so its two counts and its verb agree.

### On a phone

Phases joins Sources in the library head cluster beside Settings — not a tab entry. The
tab bar stays two destinations plus add (rule 13). At five items the row **wraps**, which
does more than avoid an overflow: the cluster stops demanding one line and collapses, the
title column grows back, and the head gets *shorter*. Delete account stays in the cluster;
the reference omitted it and has been corrected.

---

## 9. The project ledger

`ledger-reference.html` is the visual source of truth. A ledger item is **a link, not a
document**: the thing lives where you made it — a PR, a markdown ADR, an Excalidraw board,
a GitHub issue — and the ledger knows its title, its kind, its status, and which capability
it serves.

### No documents, and no detail page

No ADR body, context, alternatives or consequences. No upload, no image. Those live at the
link, in a file you can diff, which is what an ADR is for. **A row is the item**, and its
title opens the link — a page built to display a title and a URL is a place to look at a
link instead of following it. Both are structural: `ledger_test.sql` asserts the exact
column set, so a `body` cannot be added without failing a test that says why.

### One stored enum, six vocabularies

`open | settled | retired`, rendered in each kind's own words — an ADR is **Decided**, a
task is **Done**, an incident is **Closed**. Three is enough for every kind; six would be a
workflow. The mapping lives in the domain beside the which-half copy and the delete copy,
because a rule stated in words must not drift from the rule.

A milestone retires as **Dropped**, never "Missed". A missed milestone is the product
working out that you are behind, which is what the free-text "When" on a phase refuses.

### Status is drawn in ink, never green

`--ok` marks what the app **derives**. A ledger status is a **self-report** — you set it by
hand, and the product cannot know whether you shipped what a URL points at. It is the same
reason confidence is drawn in ink rather than red/amber/green: a judgement is not a fact.

So: open is a dashed hollow dot in `--ink-3`, settled a filled `--ink` dot in ink, retired a
hollow grey dot with grey text. Distinct without colour-coding. `--ok` stays at its three
derived cases. `ledger-reference.html` drew settled in green and has been corrected.

**The general check**, because four references running have now made this mistake: before
using `--ok` or `--flag` in a reference, ask **what kind of claim the thing is making**, not
how it should feel.

### The ledger never changes whether a capability is demonstrated

Demonstrated stays recall plus evidence, exactly as §8 defines it. A rule that counted
ledger items would be a rule you could satisfy with a bookmark. The ledger line on a
capability is **context** — and `demonstrationOf` takes only the linked topics, so there is
no parameter a ledger item could arrive through.

### One new filter, and only one

`?capability=` on `/ledger`, linked from that line. It is the reason an item knows about a
capability at all, so it is the one filter that survives a reload and a share. The ledger's
own kind and status chips are local view state over an already-loaded list, derived from the
kinds actually present so a chip never reads zero. Nothing is added to the library's
filters.

### Stamped, never back-dated

No date field. Back-dating a decision you made last week is the kind of tidying that turns a
record into a story. **Retired rows stay**, in place, at their original date — a ledger that
deletes what you changed your mind about is not a record.

### The delete says what it does not touch

*"Nothing at the link is touched — the ADR stays where you wrote it."* A ledger of links is
the one place in this product where a delete is nearly free, and the sentence should say so
rather than borrowing the gravity of deleting a topic. The second clause names the kind's
own noun. With no link there is no such promise to make, and the copy does not make one.

### On a phone: the sixth item, and the end of the cluster

Arc 3 shipped the account surface as a wrapping row of five and recorded, as an open
question, that it was becoming a menu. Ledger is the sixth, so it became one: **a single
`More` link opening a sheet** with all six and their counts, Delete account last in
`--flag`.

Rule 13 survives untouched — none of the six is a destination you bounce between. The head
now costs one word at any number of destinations, which the wrapping row could not promise.
The sheet is the existing `Sheet` at `placement="bottom"`, so the focus trap, Escape and
scrim-press behaviour are inherited rather than reimplemented.

---

## 10. Today

`today-reference.html` is the visual source of truth. Three things you type each morning —
one to **explain**, one to **rebuild**, one to **apply** — plus a blocker. Free text, by
hand. Nothing derived, nothing suggested, nothing scheduled.

### Ticking your own intention is not ticking your own competence

The two boxes look identical, and the distinction is the whole reason one is clickable:

> A **capability** is a claim about **ability**. The app derives it, because you cannot
> grade your own competence — so its box has no handler and there is no column to write to.
>
> A daily **intention** is a claim about **what you did**. Only you can make it, and the app
> has no way to know — so ticking it is the only mechanism there could be.

Different kinds of claim, different rules. §8's assertions are untouched: they are about
`capabilities`, and the check that `/phases` has no checkbox anywhere is now *sharper* —
the app has checkboxes, and that screen deliberately has none.

**An empty line's box is not a control at all** — a `span`, not a disabled button, following
§5's rule that a quiz's options stop being buttons rather than becoming disabled ones. An
empty slot keeps its place and its label, because collapsing to two would make a missing
decision invisible.

### The day key is the user's local date

Computed in the browser by `localDateString`, never on the server: on a UTC host the
calendar date is wrong for a third of every day. Every surface that needs to know which day
it is resolves it after mount and renders nothing for it until it does — a count for the
wrong day is worse than no count.

### Prefill, not carry

Yesterday's unticked lines arrive as editable text with a Clear button, and **nothing is
written until you press Save**. Automatic carry-forward is how a to-do list grows a backlog
you stop reading; prefilling makes you look at it once a day and decide again.

A ticked line is never offered back — it is finished. There is **no carry count**: no
lineage is stored, and "2 days" is a number whose only job is to say you are behind, which
the free-text "When" rule in §8 and the no-streak rule both refuse.

### A day with nothing typed has no row

Opening the app does not create a record. A day you never wrote on is not a day you failed,
and it does not appear in the log.

**Earlier days are read-only.** Ticking Thursday's box from Sunday's chair is writing
history rather than recording it.

### The blocker outlives its day

It shows on Today until you mark it resolved, because a problem written on Friday and
forgotten by Monday is what the field exists to prevent. The **oldest** open one is shown —
it is the one most at risk — with a count of any others rather than a list, since listing
them would rebuild the backlog prefill already refuses. Resolving keeps the text and stamps
the date.

### The practice line is the only derived thing, and every number links through

Queued → the session. Needs review → the weak page. Longest gap → the topic that has it.

Two rules this screen settled, both new and both reachable for again:

**A gap is between two practices.** A never-practised topic has an *absence*, not a gap, and
an absence belongs on the weak page. So the longest gap is computed only over topics with a
`last_practiced_at`.

**A number with nothing to link to is omitted, not rendered dead.** If nothing has ever been
practised there is no gap to report, so the phrase disappears — the same rule as "a topic
with no source omits the section", applied to a figure rather than a section. A number you
cannot click through to is a number that does not belong here.

No weak-topic list on Today. That is the weak page's job, and duplicating it is how this
page becomes a dashboard.

### On a phone

Today joins the More sheet as its **seventh** item, at the top — the sheet §9 built is why a
seventh costs nothing. Boxes keep their 18px visual size inside a **44px tap target**,
because ticking is the most likely thing anyone does here.

### Not built

No calendar, heatmap, streak or completion rate — a log you read, not a chart you look at.
No reminders, notifications or scheduling. No links from an intention to a source,
capability, ledger item or topic; linking them would make Today derive its content.
**Today is not the landing page** — the library stays the front door.

---

## 11. Copy rules

Sentence case everywhere. Active voice. An action keeps its name through the
whole flow — the button that says "Save topic" produces a toast that says
"Saved".

Prefer `Never practiced` to `Last practiced: Never`. Errors state what happened
and what to do; they never apologize and are never vague. Empty screens are
invitations, not apologies.

---

## 12. Accessibility floor

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

## 13. Out of scope

The mock shows a few things beyond the original spec. Ship them only if the core
loop is done: search-term highlighting in card titles, "Review the 2 you missed"
on the session-complete screen, undo on the edit toast, per-option counts in the
difficulty select.
