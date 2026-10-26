"use client";
import { useEffect, useMemo, useState } from "react";
import { BrandRow, Chip, Field, Heading, Hero, HeroBody, Page, PrimaryButton, Tag, TextButton, textareaCls, WishTile } from "./ui";
import { wishes as wishCatalog } from "@/lib/engine/catalog";
import { quiz, archetypeInfo } from "@/lib/archetypes";
import type { Archetype, PriorAttempts } from "@/lib/types";

const SAMPLE = {
  wish: "Land a new-grad SWE offer",
  moves: [
    { title: "Ask a recent grad at your target company for a 20-minute referral chat", minutes: "20 min", cost: "free" as const },
    { title: "Solve one timed medium problem and write up your approach out loud", minutes: "45 min", cost: "free" as const },
    { title: "Book a mock interview with an engineer who runs real loops", minutes: "1 hr", cost: "paid" as const },
  ],
};

const STEPS = [
  { n: 1, title: "Name a goal", body: "One thing you want to make happen: an offer, a grad program, a project you keep putting off." },
  { n: 2, title: "See three moves", body: "Concrete first steps sized for this week, written for where you are now." },
  { n: 3, title: "Pick one and rate it", body: "Choose the move you would actually do and tell us if it was useful." },
];

/** Sample of the pick screen; the highlighted card cycles unless the student prefers reduced motion. */
function SamplePick() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setOn((i) => (i + 1) % SAMPLE.moves.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-hidden="true" className="flex flex-col gap-2.5 rounded-[20px] bg-white/10 p-3 ring-1 ring-white/20 sm:p-4">
      <div className="flex flex-col gap-0.5 rounded-xl bg-white/15 px-3.5 py-3 text-white">
        <span className="text-xs font-bold text-band-text">Your wish</span>
        <span className="text-[15px] font-bold">{SAMPLE.wish}</span>
      </div>
      {SAMPLE.moves.map((m, i) => (
        <div key={m.title} className={`flex items-center gap-3 rounded-[14px] bg-white px-4 py-3.5 text-ink shadow-[0_8px_24px_rgba(0,40,85,0.18)] transition-all duration-500 ${i === on ? "translate-x-0 ring-2 ring-[#FFC627]" : "opacity-85 sm:translate-x-2"}`}>
          <span className="flex flex-1 flex-col gap-2">
            <span className="text-[15px] font-bold leading-[1.3]">{m.title}</span>
            <span className="flex gap-1.5"><Tag kind="time">{m.minutes}</Tag><Tag kind={m.cost}>{m.cost === "free" ? "Free" : "Paid"}</Tag></span>
          </span>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${i === on ? "bg-blue" : "border-2 border-check"}`}>
            {i === on && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,13 9,18 20,6" /></svg>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Welcome({ initialName, onContinue }: { initialName: string; onContinue: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  const ok = !!name.trim();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="bg-blue pb-16 pt-4">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-10 px-5 lg:flex-row lg:items-center lg:gap-14 lg:pb-6">
          <div className="flex flex-1 flex-col gap-5">
            <BrandRow light />
            <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold text-white">A 5-minute study for ASU CS students</span>
            <h1 className="m-0 text-[36px] font-extrabold leading-[1.05] text-white sm:text-[46px]">Turn a big goal into a first move you can start this week.</h1>
            <p className="m-0 max-w-[480px] text-[17px] leading-[1.5] text-band-text">Tell us what you want to make happen. You get three concrete moves, pick the one you would actually do, and rate how useful it was.</p>
            <form className="mt-2 flex max-w-[480px] flex-col gap-3 rounded-[14px] bg-white p-3 shadow-[0_8px_24px_rgba(0,40,85,0.22)] sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); if (ok) onContinue(name.trim()); }}>
              <label htmlFor="name" className="sr-only">Your name</label>
              <input id="name" type="text" autoComplete="off" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name"
                className="min-h-[50px] flex-1 rounded-[10px] border-0 bg-tint2 px-4 text-lg font-medium text-ink outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-blue" />
              <button type="submit" disabled={!ok} className="h-[50px] shrink-0 rounded-full bg-ink px-7 text-base font-bold text-white hover:bg-blue-dark disabled:bg-check">Get started</button>
            </form>
            <p className="m-0 text-[13px] text-band-text">
              By continuing you agree to the <a href="/terms" target="_blank" rel="noopener" className="font-bold text-white underline">study terms</a>.
            </p>
          </div>
          <div className="w-full lg:max-w-[440px]"><SamplePick /></div>
        </div>
      </div>
      <section aria-labelledby="how" className="mx-auto w-full max-w-[1040px] px-5 py-12">
        <h2 id="how" className="m-0 mb-6 text-[13px] font-extrabold uppercase tracking-[0.08em] text-blue">How it works</h2>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-2 rounded-[14px] border border-line2 bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tint text-base font-extrabold text-blue-dark">{s.n}</span>
              <span className="text-lg font-extrabold">{s.title}</span>
              <span className="text-[15px] leading-[1.5] text-muted">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function Intake({ initial, onStartOver, onSubmit }: { initial: string; onStartOver: () => void; onSubmit: (text: string, fromChip: boolean) => void }) {
  const [text, setText] = useState(initial);
  const [chip, setChip] = useState<string | null>(null);
  const chips = useMemo(() => wishCatalog.filter((w) => w.chip).slice(0, 8), []);
  const trimmed = text.trim();
  return (
    <>
      <Hero title="What do you want to make happen?" sub="Tell us one goal. We'll lay out a few first moves and you pick." onStartOver={onStartOver} />
      <HeroBody>
        <div className="field -mt-10 flex flex-col gap-1.5 rounded-[14px] border border-line2 bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(0,40,85,0.12)]">
          <label htmlFor="wish" className="text-[13px] font-bold text-blue-dark">Your wish</label>
          <textarea id="wish" rows={3} maxLength={300} value={text} placeholder="e.g. Land a new-grad SWE offer" onChange={(e) => { setText(e.target.value); setChip(null); }} className={textareaCls} />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-extrabold">Popular with students</h2>
          <div className="flex flex-wrap gap-2">
            {chips.map((w) => (
              <Chip key={w.id} selected={text === w.text} onClick={() => { setText(w.text); setChip(w.text); }}>{w.text}</Chip>
            ))}
          </div>
        </div>
        <PrimaryButton disabled={!trimmed} onClick={() => onSubmit(trimmed, chip === trimmed)}>Continue</PrimaryButton>
      </HeroBody>
    </>
  );
}

const PRIOR_CHIPS = ["Online course", "YouTube", "A club", "Nothing yet"];

export function WhyPrior({ wishText, onStartOver, onDone }: { wishText: string; onStartOver: () => void; onDone: (why: string, prior: PriorAttempts, skipped: boolean) => void }) {
  const [why, setWhy] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [tried, setTried] = useState("");
  const toggle = (c: string) => setChips((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  return (
    <Page onStartOver={onStartOver}>
      <WishTile text={wishText} />
      <Heading title="A bit of context" sub="Both are optional. Skip if you like." />
      <Field id="why" label="Why do you want this?">
        <textarea id="why" rows={2} maxLength={400} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="One or two sentences" className={textareaCls} />
      </Field>
      <section className="flex flex-col gap-3" aria-labelledby="tried">
        <h2 id="tried" className="m-0 text-base font-extrabold">Have you already tried something for this that you didn&apos;t like?</h2>
        <div className="flex flex-wrap gap-2">{PRIOR_CHIPS.map((c) => <Chip key={c} selected={chips.includes(c.toLowerCase())} onClick={() => toggle(c.toLowerCase())}>{c}</Chip>)}</div>
        <Field id="tried-text" label="What happened? (optional)">
          <textarea id="tried-text" rows={2} maxLength={400} value={tried} onChange={(e) => setTried(e.target.value)} className={textareaCls} />
        </Field>
      </section>
      <div className="mt-auto flex flex-col gap-1">
        <PrimaryButton className="mt-0" onClick={() => onDone(why.trim(), { chips, text: tried.trim() || undefined }, false)}>Continue</PrimaryButton>
        <TextButton className="self-center text-center" onClick={() => onDone("", { chips: [] }, true)}>Skip</TextButton>
      </div>
    </Page>
  );
}

export function Quiz({ onStartOver, onAnswer, onDone, onSkip }: { onStartOver: () => void; onAnswer: (q: string, a: string) => void; onDone: (answers: Record<string, string>) => void; onSkip: (answers: Record<string, string>) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const q = quiz[i];
  const pick = (aid: string) => {
    const next = { ...answers, [q.id]: aid };
    setAnswers(next);
    onAnswer(q.id, aid);
    if (i + 1 < quiz.length) setI(i + 1);
    else onDone(next);
  };
  return (
    <Page onStartOver={onStartOver}>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-3 gap-1.5">{quiz.map((x, n) => <span key={x.id} className={`h-1.5 rounded-[3px] ${n <= i ? "bg-blue" : "bg-line"}`} />)}</div>
        <span className="text-[13px] font-semibold text-muted">Question {i + 1} of {quiz.length}</span>
      </div>
      <Heading title={q.prompt} />
      <div className="flex flex-col gap-2.5">
        {q.answers.map((a) => (
          <button key={a.id} type="button" onClick={() => pick(a.id)} className="min-h-[56px] rounded-[14px] border-[1.5px] border-line bg-white px-4 py-3.5 text-left text-base font-bold hover:border-blue">
            {a.label}
          </button>
        ))}
      </div>
      <TextButton className="mt-auto self-center text-center" onClick={() => onSkip(answers)}>Skip these questions</TextButton>
    </Page>
  );
}

export function Interstitial({ count, canAdd, onAdd, onDone, onStartOver }: { count: number; canAdd: boolean; onAdd: () => void; onDone: () => void; onStartOver: () => void }) {
  return (
    <Page onStartOver={onStartOver}>
      <Heading title={`${count} moves locked in`} sub={canAdd ? "Want to extend the path with one more move?" : "That's the full path."} />
      <div className="mt-auto flex flex-col gap-2">
        {canAdd && <button type="button" onClick={onAdd} className="flex h-[54px] items-center justify-center rounded-full border-2 border-ink bg-white text-base font-bold text-ink hover:bg-tint2">Add another move</button>}
        <PrimaryButton className="mt-0" onClick={onDone}>I&apos;m done</PrimaryButton>
      </div>
    </Page>
  );
}

export function Thanks({ onAgain }: { onAgain: () => void }) {
  return (
    <>
      <Hero title="Thanks, that helps a lot." sub="Your choices and feedback were saved under your name." />
      <HeroBody>
        <PrimaryButton onClick={onAgain}>Try another wish</PrimaryButton>
      </HeroBody>
    </>
  );
}

export { archetypeInfo };
export type { Archetype };
