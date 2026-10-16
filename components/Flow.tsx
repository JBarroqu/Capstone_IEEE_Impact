"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Intake, Interstitial, Quiz, Thanks, Welcome, WhyPrior } from "./screens";
import { Pick, type LoadOptions } from "./Pick";
import { Summary, type FeedbackAnswers } from "./Summary";
import { flush, setConsent, setTrackContext, track } from "@/lib/track";
import { classify, fetchOptions, postJson, saveWish } from "@/lib/client-api";
import { assignArchetype } from "@/lib/archetypes";
import { uuid } from "@/lib/uuid";
import type { Archetype, Domain, Focus, Move, PriorAttempts, WishContext, WishType } from "@/lib/types";

type Screen = "welcome" | "intake" | "why" | "quiz" | "pick" | "more" | "summary" | "thanks";
type Wish = { id: string; text: string; type: WishType; focus: Focus[]; domains: Domain[]; why?: string; prior: PriorAttempts };
type Session = { sessionId: string; participantCode: string };

const blankWish = (): Wish => ({ id: uuid(), text: "", type: "open_ended", focus: [], domains: [], prior: { chips: [] } });
const MAX_STEPS = 5;

export default function Flow({ consentCopy }: { consentCopy: { intro: string; data: string } }) {
  // ?p=NAME (optional) prefills the name box; participants can still edit it.
  const [initialName] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("p")?.trim().slice(0, 60) ?? ""));
  const [screen, setScreen] = useState<Screen>("welcome");
  const [session, setSession] = useState<Session | null>(null);
  const [wish, setWish] = useState<Wish>(blankWish);
  const [archetype, setArchetype] = useState<Archetype>();
  const [path, setPath] = useState<Move[]>([]);
  const [step, setStep] = useState(1);
  const [totalSteps, setTotalSteps] = useState(3);
  const [paidShown, setPaidShown] = useState<Move[]>([]);
  const prefetch = useRef(new Map<string, Promise<Awaited<ReturnType<typeof fetchOptions>>>>());
  // The wish is classified in the background after submit; every move request waits for it.
  const classified = useRef<Promise<Pick<Wish, "focus" | "domains" | "type">> | null>(null);
  const withClass = async (w: Wish): Promise<Wish> => ({ ...w, ...(await classified.current) });
  const screenRef = useRef<Screen>("welcome");
  const go = (s: Screen) => { screenRef.current = s; setScreen(s); window.scrollTo(0, 0); };

  const ctx = (w: Wish, chosen: Move[]): WishContext => ({
    wishText: w.text, type: w.type, focus: w.focus, domains: w.domains, why: w.why, prior: w.prior, archetype, chosen,
  });
  const body = (w: Wish, a: Parameters<LoadOptions>[0]) => ({
    sessionId: session?.sessionId, wishId: w.id, step: a.step, rerollIndex: a.rerollIndex, excludeIds: a.excludeIds,
    rejectReason: a.rejectReason, rejectedMoves: a.rejectedMoves, ctx: ctx(w, a.chosen),
  });

  const load: LoadOptions = useCallback((a) => {
    const key = `${wish.id}:${a.step}`;
    const pre = a.rerollIndex === 0 ? prefetch.current.get(key) : undefined;
    return pre ?? withClass(wish).then((w) => fetchOptions(body(w, a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wish, session, archetype]);

  const startPrefetch = (nextStep: number, chosen: Move[]) => {
    if (nextStep > MAX_STEPS) return;
    const a = { step: nextStep, chosen, excludeIds: [], rerollIndex: 0 };
    const p = withClass(wish).then((w) => fetchOptions(body(w, a)));
    p.catch(() => prefetch.current.delete(`${wish.id}:${nextStep}`));
    prefetch.current.set(`${wish.id}:${nextStep}`, p);
  };

  // session_abandoned on pagehide before completing.
  useEffect(() => {
    const h = () => {
      if (session && screenRef.current !== "thanks" && screenRef.current !== "welcome") track("session_abandoned", { last_screen: screenRef.current });
      flush(true);
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [session]);

  const begin = async (name: string) => {
    const s: Session = { sessionId: uuid(), participantCode: name.slice(0, 64) };
    setSession(s);
    setTrackContext({ ...s, wishId: wish.id });
    setConsent(true);
    postJson("/api/session", { ...s, consented: true }).catch(() => {});
    track("session_started", { user_agent: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}` });
    track("consent_given");
    go("intake");
  };

  const startOverWish = (logEvent: boolean) => {
    if (logEvent) track("start_over", { last_screen: screenRef.current });
    const w = blankWish();
    setWish(w); setPath([]); setStep(1); setTotalSteps(3); setPaidShown([]); prefetch.current.clear(); classified.current = null;
    if (session) setTrackContext({ ...session, wishId: w.id });
    go("intake");
  };

  const lockedMove = (m: Move, shown: Move[]) => {
    const chosen = [...path, m];
    setPath(chosen);
    setPaidShown((p) => [...p, ...shown.filter((x) => x.cost === "paid" && !p.some((y) => y.id === x.id))]);
    advance(chosen);
  };
  const skipped = (shown: Move[]) => {
    setPaidShown((p) => [...p, ...shown.filter((x) => x.cost === "paid" && !p.some((y) => y.id === x.id))]);
    advance(path);
  };
  const advance = (chosen: Move[]) => {
    const next = step + 1;
    if (step >= MAX_STEPS) return finish(chosen);
    if (step >= 3) { go("more"); return; }
    setStep(next);
    startPrefetch(next, chosen);
    // key change remounts Pick
    go("pick");
  };
  const addMore = () => { const next = step + 1; setTotalSteps(Math.max(totalSteps, 5)); setStep(next); startPrefetch(next, path); go("pick"); };
  const finish = (chosen: Move[]) => {
    track("path_completed", { move_ids: chosen.map((m) => m.id) });
    go("summary");
  };

  return (
    <main>
      {screen === "welcome" && <Welcome copy={consentCopy} initialName={initialName} onContinue={begin} />}
      {screen === "intake" && (
        <Intake initial={wish.text} onStartOver={() => startOverWish(true)} onSubmit={(text, fromChip) => {
          setWish((w) => ({ ...w, text }));
          track("wish_submitted", { text, from_chip: fromChip });
          saveWish({ id: wish.id, sessionId: session!.sessionId, text, fromChip });
          // Classified by the model chain while the student answers the next screens; never shown to them.
          classified.current = classify(text).then((c) => {
            track("classification_guessed", c.log);
            setWish((w) => (w.id === wish.id ? { ...w, ...c.wish } : w));
            saveWish({ id: wish.id, sessionId: session!.sessionId, guessedFocus: c.wish.focus, guessedDomains: c.wish.domains, ...c.wish });
            return c.wish;
          });
          go("why");
        }} />
      )}
      {screen === "why" && (
        <WhyPrior wishText={wish.text} onStartOver={() => startOverWish(true)} onDone={(why, prior, skippedAll) => {
          track("why_submitted", { text: why || null, skipped: !why });
          track("prior_attempts_submitted", { chips: prior.chips, text: prior.text ?? null, skipped: skippedAll || (!prior.chips.length && !prior.text) });
          setWish((w) => ({ ...w, why: why || undefined, prior }));
          saveWish({ id: wish.id, sessionId: session!.sessionId, why: why || undefined, priorAttempts: prior });
          if (archetype) { saveWish({ id: wish.id, sessionId: session!.sessionId, archetype }); go("pick"); } else go("quiz");
        }} />
      )}
      {screen === "quiz" && (
        <Quiz onStartOver={() => startOverWish(true)} onAnswer={(q, a) => track("quiz_answered", { q, answer: a })}
          onDone={(answers) => {
            const a = assignArchetype(answers);
            track("archetype_assigned", { archetype: a, answers });
            setArchetype(a);
            saveWish({ id: wish.id, sessionId: session!.sessionId, archetype: a });
            // prefetch move 1 with the archetype now known
            const key = `${wish.id}:1`;
            const p = withClass(wish).then((w) => fetchOptions({ sessionId: session?.sessionId, wishId: w.id, step: 1, rerollIndex: 0, excludeIds: [], ctx: { ...ctx(w, []), archetype: a } }));
            p.catch(() => prefetch.current.delete(key));
            prefetch.current.set(key, p);
            go("pick");
          }} />
      )}
      {screen === "pick" && (
        <Pick key={`${wish.id}-${step}`} step={step} totalSteps={totalSteps} wishText={wish.text} chosen={path} load={load}
          onLocked={lockedMove} onSkipped={skipped} onStartOver={() => startOverWish(true)} />
      )}
      {screen === "more" && <Interstitial count={path.length} canAdd={step < MAX_STEPS} onAdd={addMore} onDone={() => finish(path)} onStartOver={() => startOverWish(true)} />}
      {screen === "summary" && (
        <Summary wishText={wish.text} why={wish.why} path={path} paidShown={paidShown} onStartOver={() => startOverWish(true)}
          onSubmit={(a: FeedbackAnswers) => {
            track("path_rated", { rating: a.rating });
            if (a.doThisWeek) track("would_do_this_week", { answer: a.doThisWeek });
            for (const [id, answer] of Object.entries(a.paid)) track("paid_willingness", { move_id: id, answer });
            if (a.open) track("open_feedback", { text: a.open });
            flush();
            go("thanks");
          }} />
      )}
      {screen === "thanks" && <Thanks onAgain={() => startOverWish(false)} />}
    </main>
  );
}
