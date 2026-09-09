'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { VoltButton } from '@/components/interview/volt-button'
import { BackToLibrary } from '@/components/ui/back-to-library'
import { ANSWER_MODES, speechSupported, type AnswerMode } from '@/lib/domain/voice'
import {
  LENGTHS,
  LEVELS,
  ROUND_TYPES,
  estimateRoundCost,
  questionCount,
  poolLine,
  HINTS_PER_ROUND,
  EXCHANGE_CAP,
  type Length,
  type Level,
  type Pool,
  type RoundType,
} from '@/lib/domain/interview'
import { plural } from '@/lib/domain/plural'

/**
 * Set up a round.
 *
 * ── Three choices, three checks, then one button ────────────────────────────
 * `Enter the room` is DISABLED until round, length and interviewer are all
 * chosen — disabled and not absent, which is the opposite call from the one made
 * about DSA and voice and for the stated reason: this is one click away, and the
 * button is what tells you so. A feature that does not exist gets no control at
 * all; a feature you have not finished configuring gets a dimmed one.
 *
 * ── Why this is a client component ──────────────────────────────────────────
 * It was URL-driven, one `<Link>` per choice. That cannot work now, for two
 * reasons that are both about `page.tsx`:
 *
 *   1. That page enters the room the moment `?type=` is present, so under
 *      URL-driven selection *picking a type IS entering* — the disabled button
 *      could never be reached, let alone become enabled.
 *   2. A `<Link>` is prefetched. The page it points at calls the model on
 *      render, so a hover was a billed call nobody pressed, on a screen whose
 *      whole rule is that no model call happens here. Entry by `router.push`
 *      removes the question instead of answering it.
 *
 * Selection is pre-commitment state that dies on press, so it lives in `useState`
 * rather than costing a round trip and a re-read of the pool per click. The URL
 * keeps the job it is good at — entry — so `/interview?type=…&minutes=…&level=…`
 * still opens a round and every existing spec is untouched.
 *
 * ── The pool line is read from your data ────────────────────────────────────
 * And it says honestly when a round would be thin. Nothing is asked that you have
 * not saved, so a category with four topics cannot fill an eight-question round
 * and the card says so before you press.
 */
const LEVEL_LABEL: Record<Level, { name: string; how: string }> = {
  friendly: { name: 'Friendly senior', how: 'nudges, accepts a good direction' },
  staff: { name: 'Staff, terse', how: 'two follow-ups, no encouragement' },
  skeptical: { name: 'Skeptical principal', how: 'pushes until you concede or hold' },
}

/**
 * Name, sub-line, and the tone that identifies the round on sight.
 *
 * The tone is per type and fixed, the way the dimension hues are on the
 * scorecard: it is an identifier, not a judgement, so JavaScript is teal in every
 * round you ever run. Held as a whole class string rather than assembled, so
 * Tailwind's scanner sees a complete name.
 */
const TYPE: Record<RoundType, { name: string; how: string; tone: string }> = {
  javascript: {
    name: 'JavaScript',
    how: 'Concepts, escalating follow-ups',
    tone: '[--tone:var(--teal)]',
  },
  react: { name: 'React', how: 'Concepts, escalating follow-ups', tone: '[--tone:var(--blue)]' },
  typescript: {
    name: 'TypeScript',
    how: 'Concepts, escalating follow-ups',
    tone: '[--tone:var(--volt)]',
  },
  behavioural: { name: 'Behavioural', how: 'Drawn from your ledger', tone: '[--tone:var(--rose)]' },
  mixed: { name: 'Mixed', how: 'A real loop, all the shapes you have', tone: '[--tone:var(--slate)]' },
}

/**
 * The section rule — an eyebrow with a hairline running to the right edge.
 *
 * Drawn as its own element rather than on the `<legend>`. A legend is rendered
 * by the UA as part of the fieldset's border box: `display:flex` on it does not
 * behave like flex anywhere else, and its margins collapse in ways ordinary
 * boxes do not. The first attempt put this class on the legend and the hairline
 * simply never appeared, with the section spacing collapsing at the same time —
 * both from the same cause.
 *
 * So the legend stays for the accessible name and is visually hidden, and this
 * is the thing you see.
 */
function Rule({ children }: { children: string }) {
  return (
    <div aria-hidden="true" className="mt-7 mb-3 flex items-center gap-3">
      <span className="font-mono text-[10.5px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  )
}

const NOTE = 'mt-6 max-w-[70ch] border-t border-rule pt-4 text-[13.5px] leading-[1.7] text-ink-2'

export function Setup({
  pools,
  minutes: initialMinutes,
  level: initialLevel,
}: {
  pools: Record<RoundType, Pool>
  /** Null unless a URL supplied one — two of three gates would be fiction otherwise. */
  minutes: Length | null
  level: Level | null
}) {
  const router = useRouter()
  const [entering, startEntering] = useTransition()

  /*
    ── Every group arrives with a choice made ────────────────────────────────
    The first option in each row, and its check with it — three ticks before you
    have touched anything, which is what says these are choices rather than
    fixed settings.

    This retires the gate. `Enter the room` was disabled until all three were
    chosen, which was the right call against the thing it was guarding — a round
    started unconfigured — and the wrong instrument. Defaults solve it better,
    because nothing can BE unconfigured, and a button you cannot press teaches
    less than a summary that is already true and that you can change.

    A URL still wins where it supplies one, so a linked round keeps its shape.
  */
  const [type, setType] = useState<RoundType>(ROUND_TYPES[0])
  const [minutes, setMinutes] = useState<Length>(initialMinutes ?? LENGTHS[0])
  const [level, setLevel] = useState<Level>(initialLevel ?? LEVELS[0])
  const [mode, setMode] = useState<AnswerMode>(ANSWER_MODES[0])

  /*
    Whether this browser can hear you, asked after mount because the server
    cannot know. `null` until then, never `false`: a default of `false` renders
    "your browser cannot do this" to everyone for one frame, and that sentence is
    wrong more often than it is right. The slot is empty for that frame instead.
  */
  const [canHear, setCanHear] = useState<boolean | null>(null)
  useEffect(() => {
    setCanHear(speechSupported(window as unknown as Record<string, unknown>))
  }, [])

  /*
    If the browser turns out not to support it, the choice cannot stand. This
    only fires for a deep link carrying `mode=voice` — nothing on screen can
    select an option that is not rendered.
  */
  useEffect(() => {
    if (canHear === false) setMode('typing')
  }, [canHear])

  const questions = questionCount(minutes)
  const cost = estimateRoundCost(minutes)
  const money = (value: number) => `$${value.toFixed(2)}`

  const enter = () => {
    startEntering(() => {
      router.push(`/interview?type=${type}&minutes=${minutes}&level=${level}&mode=${mode}`)
    })
  }

  return (
    <main className="mx-auto max-w-[1020px] px-[26px] pt-7 pb-20">
      {/*
        The interview group has no rail, so this page had no way back to the
        library at all — the same absence the room has by design and this page
        has by omission.
      */}
      <div className="mb-5">
        <BackToLibrary>← Library</BackToLibrary>
      </div>

      <h1 className="font-display text-[29px] font-medium tracking-[-0.022em]">
        Set up an interview round
      </h1>
      <p className="mt-1.5 max-w-[62ch] text-ink-2">
        Every question comes from your own library. Nothing is asked that you have not saved.
      </p>

      {/* ── Round ─────────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="sr-only">Round</legend>
        <Rule>Round</Rule>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-3">
          {ROUND_TYPES.map((option) => {
            const line = poolLine(option, pools[option], questions)
            const picked = type === option

            return (
              <label
                key={option}
                data-testid={`round-type-${option}`}
                data-picked={picked}
                className={`${TYPE[option].tone} relative flex cursor-pointer flex-col rounded-[10px] border bg-surface px-[18px] pt-[17px] pb-[15px] text-left shadow-[0_1px_2px_rgba(18,19,26,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--tone)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--volt)] ${
                  picked
                    ? 'border-[var(--tone)] shadow-[inset_0_0_0_1px_var(--tone)]'
                    : 'border-rule hover:shadow-[0_2px_4px_rgba(18,19,26,0.05)]'
                }`}
              >
                <input
                  type="radio"
                  name="round-type"
                  value={option}
                  checked={picked}
                  onChange={() => setType(option)}
                  className="sr-only"
                />

                {/* A check in the top-right the moment it is chosen. Three ticks means ready. */}
                {picked ? (
                  <span
                    aria-hidden="true"
                    data-testid="type-check"
                    className="absolute top-[14px] right-[14px] grid size-5 place-items-center rounded-full bg-[var(--tone)] text-[11px] leading-none text-white"
                  >
                    ✓
                  </span>
                ) : null}

                {/* The dot IS the tone, and it stretches when chosen — a second, non-colour signal. */}
                <span
                  aria-hidden="true"
                  className={`mb-3 h-[9px] rounded-[3px] bg-[var(--tone)] transition-[width] duration-150 ${
                    picked ? 'w-[26px]' : 'w-[9px]'
                  }`}
                />

                <span className="font-display text-[19px] leading-[1.2] font-medium tracking-[-0.015em] text-ink">
                  {TYPE[option].name}
                </span>
                <span className="mt-[5px] text-[12.5px] leading-[1.5] text-ink-2">
                  {TYPE[option].how}
                </span>

                <span
                  className={`mt-[14px] block border-t border-rule pt-3 font-mono text-[10.5px] ${
                    line.thin ? 'text-[var(--rose)]' : 'text-ink-3'
                  }`}
                >
                  {/*
                    The count carries the tone — except when the round is thin,
                    where the whole line goes rose. A tone-coloured number inside
                    a warning would be two signals arguing.
                  */}
                  <b className={line.thin ? 'font-semibold' : 'font-semibold text-[var(--tone)]'}>
                    {line.lead}
                  </b>
                  {line.rest}
                  {line.thin ? ` — thin for ${minutes} min` : ''}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* ── Length ────────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="sr-only">Length</legend>
        <Rule>Length</Rule>
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((option) => (
            <Pill
              key={option}
              name="length"
              testid={`length-${option}`}
              picked={minutes === option}
              onPick={() => setMinutes(option)}
              title={`${option} min`}
              sub={plural(questionCount(option), 'concept')}
            />
          ))}
        </div>
      </fieldset>

      {/* ── Who is interviewing you ───────────────────────────────────────── */}
      <fieldset>
        <legend className="sr-only">Who is interviewing you</legend>
        <Rule>Who is interviewing you</Rule>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((option) => (
            <Pill
              key={option}
              name="level"
              testid={`level-${option}`}
              picked={level === option}
              onPick={() => setLevel(option)}
              title={LEVEL_LABEL[option].name}
              sub={LEVEL_LABEL[option].how}
            />
          ))}
        </div>
      </fieldset>

      {/* ── How you answer ───────────────────────────────────────────────── */}
      <fieldset data-testid="answer-mode">
        <legend className="sr-only">How you answer</legend>
        <Rule>How you answer</Rule>
        <div className="flex flex-wrap gap-2">
          <Pill
            name="mode"
            testid="mode-typing"
            picked={mode === 'typing'}
            onPick={() => setMode('typing')}
            title="Typing"
            sub="works everywhere"
          />
          {/*
            The fourth group is the only one with an option the browser can
            refuse. The rule, from the reference: an option this browser cannot
            run is not offered, and the group says why.

            Not a disabled pill — disabled promises a click that would work, and
            no click will give Firefox a speech engine. Not silence either: a
            feature the product has and you cannot see is indistinguishable from
            one it does not have, which is the whole of the absence entry in
            ARCHITECTURE.md. So the pill is replaced, in its own place, by the
            sentence naming what is missing and what has it.
          */}
          {canHear === true ? (
            <Pill
              name="mode"
              testid="mode-voice"
              picked={mode === 'voice'}
              onPick={() => setMode('voice')}
              title="Voice"
              sub="you speak, it types"
            />
          ) : null}
          {canHear === false ? (
            <p
              data-testid="no-voice"
              className="max-w-[42ch] self-center font-mono text-[10.5px] leading-[1.7] text-ink-3"
            >
              Voice needs speech recognition, which this browser does not have. Chrome and Edge
              do.
            </p>
          ) : null}
        </div>

        {/*
          What leaves, named where the choice is made.

          The same promise the extract panel makes about a transcript, adapted
          rather than copied: that payload is bounded and priced, so it can say
          "sends the transcript · 1,851 words · about $0.02–$0.04". This one is
          neither — there is no word count until afterwards and no bill at all —
          so it names the recipient instead, and says plainly that it is not the
          model you already agreed to for this round. The room says it again
          while the microphone is open, because consenting and sending are two
          different moments here.
        */}
        {canHear === true ? (
          <p
            data-testid="voice-privacy"
            className="mt-2.5 max-w-[62ch] border-l-2 border-rule-strong pl-[11px] font-mono text-[10.5px] leading-[1.7] text-ink-2"
          >
            Voice sends what you say to your browser&rsquo;s speech service — Google&rsquo;s, in
            Chrome — which is not the model this round already uses. Typing sends nothing but the
            answer you press send on.
          </p>
        ) : null}
      </fieldset>

      {/* ── The start card ────────────────────────────────────────────────── */}
      <div
        data-testid="start-card"
        className="relative mt-5 overflow-hidden rounded-[22px] px-[30px] pt-7 pb-[26px] text-[var(--mesh-ink)] [background:var(--mesh)] [box-shadow:var(--mesh-shadow)]"
      >
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--mesh-key)] uppercase">
          {TYPE[type].name} · {minutes} minutes · {LEVEL_LABEL[level].name.toLowerCase()} ·{' '}
          {mode}
        </p>
        <p className="mt-2 mb-[5px] font-display text-[28px] font-medium tracking-[-0.02em] text-white">
          {plural(questions, 'concept')}, weighted toward weak
        </p>
        {/*
          Read from your data, like the pool lines above it — "Nine of your
          JavaScript topics read weak", not "the weak ones come first". A summary
          that could be written before knowing which library it is about is not a
          summary of anything.
        */}
        <p className="max-w-[56ch] text-[13.5px] leading-[1.65] text-[var(--mesh-ink-2)]">
          {pools[type].weak > 0
            ? `${pools[type].weak} of your ${TYPE[type].name} topics read weak; the queue draws from those first. `
            : 'Nothing here reads weak, so the queue draws in order. '}
          {plural(HINTS_PER_ROUND, 'hint')} available, each visible on the scorecard.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-[14px]">
          {/* No `disabled`. A round cannot be unconfigured, so there is nothing to gate. */}
          <VoltButton
            flat
            size="lg"
            loading={entering}
            loadingLabel="Opening the room…"
            onClick={enter}
            data-testid="enter-room"
          >
            Enter the room
          </VoltButton>
          <span
            data-testid="cost-estimate"
            className="ml-auto font-mono text-[11px] text-[var(--mesh-ink-3)]"
          >
            ≈ {Math.round(cost.lowTokens / 1000)}k–{Math.round(cost.highTokens / 1000)}k tokens ·{' '}
            {money(cost.lowUsd)}–{money(cost.highUsd)} · resent each turn · capped at {EXCHANGE_CAP}{' '}
            exchanges
          </span>
        </div>
      </div>

      <p className={NOTE}>
        <strong className="font-medium text-ink">All three groups arrive with a choice made</strong>{' '}
        — the first option in each row, each showing its check on arrival. Three ticks before you
        have touched anything, which is what tells you these are choices rather than fixed
        settings. There is no disabled state: the gate existed to stop a round being started
        unconfigured, and a default solves that better, because nothing can be unconfigured.
      </p>

      <div className="mt-5 max-w-[74ch] rounded-[14px] border border-[rgba(79,70,229,0.3)] border-l-[3px] border-l-[var(--volt)] bg-[linear-gradient(135deg,#F6F7FE,#FFFFFF)] px-[19px] py-[15px]">
        <p className="font-semibold text-[var(--volt-ink)]">
          Type and length set the shape — there is no minutes-per-question slider
        </p>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Real rounds are not uniform. Forty-five minutes of JavaScript is eight concepts with
          follow-ups. The pool line under each type is read from your data and says honestly when a
          round would be thin.
        </p>
      </div>

      {/*
        The rules tab claimed "the setup screen says so" about losing a round, and
        the drawing's setup screen said nothing of the kind. A round you cannot
        resume must say so BEFORE you enter, not in an appendix.
      */}
      <p className={NOTE}>
        <strong className="font-medium text-ink">A round is never resumed.</strong> Leaving this
        page, refreshing or closing the tab loses it — forty-five minutes of continuous attention
        or it is not a round.
      </p>

      <p className={NOTE}>
        Interviewer level changes only how hard the follow-ups push — it is a prompt, not a scoring
        multiplier. A skeptical principal is harder to satisfy and does not make your score lower;
        the dimensions measure what you said, not who asked.
      </p>
    </main>
  )
}

/** Length and interviewer share a shape, so they share a component. */
function Pill({
  name,
  testid,
  picked,
  onPick,
  title,
  sub,
}: {
  name: string
  testid: string
  picked: boolean
  onPick: () => void
  title: string
  sub: string
}) {
  return (
    <label
      data-testid={testid}
      data-picked={picked}
      aria-current={picked ? 'true' : undefined}
      className={`relative cursor-pointer rounded-md border px-4 py-[11px] text-left has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--volt)] ${
        picked
          ? 'border-[var(--volt)] text-white [background-image:var(--volt-grad)] [box-shadow:var(--volt-glow)]'
          : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={picked}
        onChange={onPick}
        className="sr-only"
      />
      {picked ? (
        <span
          aria-hidden="true"
          data-testid="pill-check"
          className="absolute top-[9px] right-[10px] grid size-4 place-items-center rounded-full bg-white text-[9px] leading-none text-[var(--volt)]"
        >
          ✓
        </span>
      ) : null}
      <span className="block pr-5 text-[14px] font-medium">{title}</span>
      <span className={`mt-[3px] block font-mono text-[10px] ${picked ? 'opacity-72' : 'text-ink-3'}`}>
        {sub}
      </span>
    </label>
  )
}
