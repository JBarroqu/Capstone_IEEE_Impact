"use client";
import { useMemo, useState } from "react";
import { Chip, Field, Heading, Hero, HeroBody, Page, PrimaryButton, TextButton, textareaCls, WishTile } from "./ui";
import { wishes as wishCatalog } from "@/lib/engine/catalog";
import { quiz, archetypeInfo } from "@/lib/archetypes";
import type { Archetype, PriorAttempts } from "@/lib/types";

export function Welcome({ copy, initialName, onContinue }: { copy: { intro: string; data: string }; initialName: string; onContinue: (name: string) => void }) {
  const [ok, setOk] = useState(false);
  const [name, setName] = useState(initialName);
  return (
    <>
      <Hero title="Turn a big wish into a first move" />
      <HeroBody>
        <div className="-mt-8 flex flex-col gap-4 rounded-[14px] border border-line2 bg-white p-5 shadow-[0_8px_24px_rgba(0,40,85,0.12)]">
          <p className="m-0 text-[15px] leading-[1.5]">{copy.intro}</p>
          <p className="m-0 text-[15px] leading-[1.5]">{copy.data}</p>
          <Field id="name" label="Your name">
            <input id="name" type="text" autoComplete="off" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name is fine" className="border-0 bg-transparent p-0 text-lg font-medium text-ink outline-none placeholder:text-muted/70" />
          </Field>
          <label className="flex min-h-[44px] items-center gap-3 text-[15px] font-semibold">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-6 w-6 accent-[#00629B]" />
            I understand
          </label>
        </div>
        <PrimaryButton disabled={!ok || !name.trim()} onClick={() => onContinue(name.trim())}>Continue</PrimaryButton>
      </HeroBody>
    </>
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

export function Quiz({ onStartOver, onAnswer, onDone }: { onStartOver: () => void; onAnswer: (q: string, a: string) => void; onDone: (answers: Record<string, string>) => void }) {
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
