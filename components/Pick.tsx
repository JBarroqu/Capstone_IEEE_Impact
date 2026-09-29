"use client";
import { useEffect, useRef, useState } from "react";
import { BrandRow, Chip, Field, PrimaryButton, Tag, TextButton, WishTile, textareaCls } from "./ui";
import { track } from "@/lib/track";
import { OptionsError, type OptionsResponse } from "@/lib/client-api";
import type { Move, OptionsMeta, WishContext } from "@/lib/types";

export type LoadOptions = (a: { step: number; chosen: Move[]; excludeIds: string[]; rejectReason?: { chip?: string; text?: string }; rejectedMoves?: Move[]; rerollIndex: number }) => Promise<OptionsResponse>;

const REJECT_CHIPS = ["Too big", "Too small", "Not my style", "Already done this", "Don't want to pay", "Other"];
const SUB: Record<number, string> = {
  1: "Small and quick. Which one would you actually do this week?",
  2: "Builds on what move 1 showed you. Which one fits next?",
  3: "The version you'll actually ship. Which one?",
  4: "One more move to extend your path.",
  5: "A last move to round it out.",
};

function minutesLabel(m: number) {
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 10 ? `${Math.round(h * 10) / 10} hr` : `${Math.round(h)} hr`;
}

export function Pick({ step, totalSteps, wishText, chosen, load, onLocked, onSkipped, onStartOver }: {
  step: number; totalSteps: number; wishText: string; chosen: Move[]; load: LoadOptions;
  onLocked: (m: Move, shown: Move[]) => void; onSkipped: (shown: Move[]) => void; onStartOver: () => void;
}) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rerollIndex, setRerollIndex] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const [error, setError] = useState(false);
  const shownAt = useRef(0);
  const excluded = useRef<string[]>([]);
  const allShown = useRef<Move[]>([]);
  const started = useRef(false);
  const lastReject = useRef<{ reason?: { chip?: string; text?: string }; moves?: Move[] } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function fetchSet(reroll: number, reject?: { chip?: string; text?: string }, rejectedMoves?: Move[]) {
    lastReject.current = reject || rejectedMoves ? { reason: reject, moves: rejectedMoves } : null;
    setMoves(null); setError(false); setSelected(null);
    try {
      const res = await load({ step, chosen, excludeIds: excluded.current, rejectReason: reject, rejectedMoves, rerollIndex: reroll });
      if (!mounted.current) return;
      const meta: OptionsMeta = res.meta;
      excluded.current = [...excluded.current, ...res.moves.map((m) => m.id)];
      allShown.current = [...allShown.current, ...res.moves];
      shownAt.current = Date.now();
      setRerollIndex(reroll); setFbDone(false); setMoves(res.moves);
      track("options_shown", {
        move_ids: res.moves.map((m) => m.id), reroll_index: reroll, relaxed: meta.relaxed, sources: meta.sources,
        requested_provider: meta.requestedProvider, used_provider: meta.usedProvider, model: meta.model ?? null,
        prompt_version: meta.promptVersion ?? null, latency_ms: meta.latencyMs, cache_hit: meta.cacheHit, repaired: meta.repaired,
      }, step);
      if (meta.fallbackReason) track("provider_fallback", { requested_provider: meta.requestedProvider, reason: meta.fallbackReason }, step);
      if (meta.relaxed) track("options_relaxed", { reroll_index: reroll }, step);
    } catch (e) {
      if (!mounted.current) return;
      track("options_failed", { reason: e instanceof OptionsError ? e.reason : "network", reroll_index: reroll }, step);
      setError(true);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchSet(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ms = () => Date.now() - shownAt.current;
  const tap = (m: Move, pos: number) => {
    if (selected === m.id) { setSelected(null); track("option_deselected", { move_id: m.id, position: pos, ms_since_shown: ms() }, step); }
    else { setSelected(m.id); track("option_selected", { move_id: m.id, position: pos, ms_since_shown: ms() }, step); }
  };
  const lock = () => {
    const pos = moves!.findIndex((m) => m.id === selected);
    if (pos < 0) return;
    track("move_locked", { move_id: selected, position: pos, ms_since_shown: ms(), reroll_index: rerollIndex }, step);
    onLocked(moves![pos], allShown.current);
  };
  const reject = (chip: string | undefined, text: string) => {
    setSheet(false);
    const rejected = moves ?? [];
    track("options_rejected", { reason_chip: chip ?? null, text: text || null, move_ids: rejected.map((m) => m.id) }, step);
    fetchSet(rerollIndex + 1, { chip: chip?.toLowerCase(), text: text || undefined }, rejected);
  };
  const feedback = (answer: string) => { setFbDone(true); track("options_feedback", { answer }, step); };

  return (
    <div className="mx-auto flex min-h-dvh max-w-[600px] flex-col gap-4 px-5 pb-8 pt-4">
      <BrandRow onStartOver={onStartOver} />
      <div className="flex flex-col gap-1.5">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalSteps }, (_, i) => <span key={i} className={`h-1.5 rounded-[3px] ${i < step ? "bg-blue" : "bg-line"}`} />)}
        </div>
        <span className="text-[13px] font-semibold text-muted">Move {step} of {totalSteps}</span>
      </div>
      <WishTile text={wishText} />
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[27px] font-extrabold leading-[1.1]">Pick your {["first", "second", "third", "fourth", "fifth"][step - 1]} move</h1>
        <p className="m-0 text-[15px] text-muted">{SUB[step]}</p>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-2 rounded-[14px] border border-line p-4">
          <p className="m-0 text-[15px]">We couldn&apos;t load your options this time. Nothing you entered was lost.</p>
          <TextButton onClick={() => fetchSet(rerollIndex, lastReject.current?.reason, lastReject.current?.moves)}>Try again</TextButton>
        </div>
      ) : moves === null ? (
        <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading options">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-[104px] items-center gap-3 rounded-[14px] border-[1.5px] border-line bg-white px-4">
              <div className="flex flex-1 flex-col gap-3"><span className="h-4 w-4/5 rounded bg-chip" /><span className="h-3 w-1/2 rounded bg-chip" /></div>
              <span className="h-6 w-6 rounded-full bg-chip" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {moves.map((m, i) => {
            const on = selected === m.id;
            return (
              <button key={m.id} type="button" aria-pressed={on} onClick={() => tap(m, i)}
                className={`flex items-center gap-3 rounded-[14px] px-4 text-left text-ink ${on ? "border-2 border-blue bg-tint2 py-[13.5px]" : "border-[1.5px] border-line bg-white py-3.5 hover:border-blue"}`}>
                <span className="flex flex-1 flex-col gap-2">
                  <span className={`text-base leading-[1.3] ${on ? "font-extrabold" : "font-bold"}`}>{m.title}</span>
                  <span className="text-sm leading-[1.4] text-muted">{m.detail}</span>
                  <span className="flex gap-1.5"><Tag kind="time">{minutesLabel(m.minutes)}</Tag><Tag kind={m.cost}>{m.cost === "free" ? "Free" : "Paid"}</Tag></span>
                </span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? "bg-blue" : "border-2 border-check"}`}>
                  {on && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4,13 9,18 20,6" /></svg>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TextButton className="flex-1" disabled={moves === null} onClick={() => setSheet(true)}>None of these fit</TextButton>
        {moves && !fbDone && (
          <>
            <span className="text-[13px] font-semibold text-muted" id="fb-l">Helpful?</span>
            {["Yes", "Meh", "No"].map((a) => (
              <button key={a} type="button" aria-describedby="fb-l" onClick={() => feedback(a.toLowerCase())} className="h-11 rounded-full bg-chip px-3.5 text-sm font-bold hover:bg-tint">{a}</button>
            ))}
          </>
        )}
        {moves && fbDone && <span className="text-[13px] font-semibold text-muted">Thanks</span>}
      </div>
      {moves && rerollIndex >= 2 && !selected && (
        <TextButton onClick={() => { track("step_skipped", { reroll_index: rerollIndex }, step); onSkipped(allShown.current); }}>Skip this step</TextButton>
      )}

      <PrimaryButton disabled={!selected} onClick={lock}>Lock in move {step}</PrimaryButton>
      {sheet && <RejectSheet onClose={() => setSheet(false)} onSubmit={reject} />}
    </div>
  );
}

function RejectSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (chip: string | undefined, text: string) => void }) {
  const [chip, setChip] = useState<string>();
  const [text, setText] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-ink/50 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="rs" onClick={(e) => e.stopPropagation()} className="sheet flex w-full max-w-[520px] flex-col gap-4 rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
        <h2 id="rs" className="m-0 text-xl font-extrabold">What was off?</h2>
        <div className="flex flex-wrap gap-2">
          {REJECT_CHIPS.map((c, i) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)} {...(i === 0 ? { ref: first } : {})}>{c}</Chip>
          ))}
        </div>
        <Field id="rs-text" label="Anything else? (optional)">
          <textarea id="rs-text" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} className={textareaCls} />
        </Field>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-[54px] flex-1 rounded-full border-2 border-ink bg-white text-base font-bold">Cancel</button>
          <button type="button" disabled={!chip && !text.trim()} onClick={() => onSubmit(chip, text.trim())} className="h-[54px] flex-[2] rounded-full bg-ink text-base font-bold text-white hover:bg-blue-dark disabled:bg-check">Show different options</button>
        </div>
      </div>
    </div>
  );
}
