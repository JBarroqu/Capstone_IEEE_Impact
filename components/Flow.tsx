"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Intake, Interstitial, Quiz, Thanks, Welcome, WhyPrior } from "./screens";
import { Pick, type LoadOptions } from "./Pick";
import { Summary, type FeedbackAnswers } from "./Summary";
import { flush, setConsent, setTrackContext, track } from "@/lib/track";
import { classify, fetchOptions, fetchQuestions, saveWish, startSession } from "@/lib/client-api";
import { assignArchetype } from "@/lib/archetypes";
import { toFollowUps } from "@/lib/follow-ups";
import { uuid } from "@/lib/uuid";
import type { Archetype, Domain, Focus, FollowUp, Move, PriorAttempts, QuestionSet, WishContext, WishType } from "@/lib/types";

type Screen = "welcome" | "intake" | "why" | "quiz" | "pick" | "more" | "summary" | "thanks";
type Wish = { id: string; text: string; type: WishType; focus: Focus[]; domains: Domain[]; why?: string; prior: PriorAttempts };
type Session = { sessionId: string; participantCode: string };

const blankWish = (): Wish => ({ id: uuid(), text: "", type: "open_ended", focus: [], domains: [], prior: { chips: [] } });
const MAX_STEPS = 5;

export default function Flow({ flowMoves }: { flowMoves: 1 | 3 }) {
  // ?p=NAME (optional) prefills the name box; participants can still edit it.
  const [initialName] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("p")?.trim().slice(0, 60) ?? ""));
  const [screen, setScreen] = useState<Screen>("welcome");
  const [session, setSession] = useState<Session | null>(null);
  const [wish, setWish] = useState<Wish>(blankWish);
  const [archetype, setArchetype] = useState<Archetype>();
  // Follow-up questions are per wish; null while they are being written.
  const [questions, setQuestions] = useState<QuestionSet | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [path, setPath] = useState<Move[]>([]);
  const [step, setStep] = useState(1);
  const [totalSteps, setTotalSteps] = useState<number>(flowMoves);
  const [paidShown, setPaidShown] = useState<Move[]>([]);
  const prefetch = useRef(new Map<string, Promise<Awaited<ReturnType<typeof fetchOptions>>>>());
  // The wish is classified in the background after submit; every move request waits for it.
  const classified = useRef<Promise<Pick<Wish, "focus" | "domains" | "type">> | null>(null);
  const withClass = async (w: Wish): Promise<Wish> => ({ ...w, ...(await classified.current) });
  const screenRef = useRef<Screen>("welcome");
  const wishIdRef = useRef(wish.id);
  wishIdRef.current = wish.id;
  const go = (s: Screen) => { screenRef.current = s; setScreen(s); window.scrollTo(0, 0); };

  const ctx = (w: Wish, chosen: Move[]): WishContext => ({
    wishText: w.text, type: w.type, focus: w.focus, domains: w.domains, why: w.why, prior: w.prior, archetype, followUps, chosen,
  });
  const body = (w: Wish, a: Parameters<LoadOptions>[0]) => ({
    sessionId: session?.sessionId, wishId: w.id, step: a.step, rerollIndex: a.rerollIndex, excludeIds: a.excludeIds, excludeTitles: a.excludeTitles,
    rejectReason: a.rejectReason, rejectedMoves: a.rejectedMoves, ctx: ctx(w, a.chosen),
  });

  const load: LoadOptions = useCallback((a) => {
    const key = `${wish.id}:${a.step}`;
    const pre = a.rerollIndex === 0 ? prefetch.current.get(key) : undefined;
    return pre ?? withClass(wish).then((w) => fetchOptions(body(w, a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wish, session, archetype, followUps]);

  const startPrefetch = (nextStep: number, chosen: Move[]) => {
    if (nextStep > MAX_STEPS || flowMoves === 1) return;
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
    startSession({ ...s, consented: true });
    track("session_started", { user_agent: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}` });
    track("consent_given");
    go("intake");
  };

  const startOverWish = (logEvent: boolean) => {
    if (logEvent) track("start_over", { last_screen: screenRef.current });
    const w = blankWish();
    setWish(w); setPath([]); setStep(1); setTotalSteps(flowMoves); setPaidShown([]); prefetch.current.clear(); classified.current = null;
    setQuestions(null); setFollowUps([]);
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
    // Quick-survey mode: straight to the rating screen after the first move.
    if (flowMoves === 1 || step >= MAX_STEPS) return finish(chosen);
    if (step >= 3) { go("more"); return; }
    setStep(next);
    startPrefetch(next, chosen);
    // key change remounts Pick
    go("pick");
  };
  const addMore = () => { const next = step + 1; setTotalSteps(Math.max(totalSteps, 5)); setStep(next); startPrefetch(next, path); go("pick"); };
  /** Fixed quiz: answers give an archetype (partial answers too). Generated questions: answers go into the moves prompt. */
  const quizDone = (set: QuestionSet, answers: Record<string, string>) => {
    let a = archetype, fu: FollowUp[] = [];
    if (set.source === "fixed") {
      a = Object.keys(answers).length ? assignArchetype(answers) : archetype;
      if (a && a !== archetype) {
        track("archetype_assigned", { archetype: a, answers });
        setArchetype(a);
      }
    } else {
      fu = toFollowUps(set, answers);
      setFollowUps(fu);
      if (fu.length) saveWish({ id: wish.id, sessionId: session!.sessionId, followUps: fu });
    }
    if (a) saveWish({ id: wish.id, sessionId: session!.sessionId, archetype: a });
    // prefetch move 1 with the answers now known
    const key = `${wish.id}:1`;
    const p = withClass(wish).then((w) => fetchOptions({ sessionId: session?.sessionId, wishId: w.id, step: 1, rerollIndex: 0, excludeIds: [], ctx: { ...ctx(w, []), archetype: a, followUps: fu } }));
    p.catch(() => prefetch.current.delete(key));
    prefetch.current.set(key, p);
    go("pick");
  };
  /** Written while the student waits on the questions screen; needs the classification and the context answers. */
  const loadQuestions = (w: Wish) => {
    withClass(w).then((c) => fetchQuestions({ wishText: c.text, type: c.type, focus: c.focus, domains: c.domains, why: c.why, prior: c.prior })).then((set) => {
      if (w.id !== wishIdRef.current) return; // the student started over meanwhile
      track("questions_shown", {
        source: set.source, provider: set.provider ?? null, model: set.model ?? null, prompt_version: set.promptVersion ?? null,
        latency_ms: set.latencyMs, tried: set.tried ?? [], fail_reason: set.failReason ?? null,
        questions: set.questions.map((q) => ({ id: q.id, prompt: q.prompt, answers: q.answers.map((x) => x.label), note: q.note })),
      });
      // The fixed quiz only places an archetype; a student who already has one does not take it again.
      if (set.source === "fixed" && archetype) return quizDone(set, {});
      setQuestions(set);
    });
  };
  const finish = (chosen: Move[]) => {
    track("path_completed", { move_ids: chosen.map((m) => m.id) });
    go("summary");
  };

  return (
    <main>
      {screen === "welcome" && <Welcome initialName={initialName} onContinue={begin} />}
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
          loadQuestions({ ...wish, why: why || undefined, prior });
          go("quiz");
        }} />
      )}
      {screen === "quiz" && (
        <Quiz set={questions} onStartOver={() => startOverWish(true)}
          onAnswer={(q, a) => track("quiz_answered", { q: q.id, answer: a.id, question: q.prompt, answer_text: a.label, source: questions?.source })}
          onDone={(answers) => quizDone(questions!, answers)}
          onSkip={(answers) => {
            // Partial answers still count; skipping all three leaves the moves to the wish and context alone.
            track("quiz_skipped", { answered: Object.keys(answers).length, source: questions?.source });
            quizDone(questions!, answers);
          }} />
      )}
      {screen === "pick" && (
        <Pick key={`${wish.id}-${step}`} step={step} totalSteps={totalSteps} wishText={wish.text} chosen={path} load={load}
          onLocked={lockedMove} onSkipped={skipped} onStartOver={() => startOverWish(true)} />
      )}
      {screen === "more" && <Interstitial count={path.length} canAdd={step < MAX_STEPS} onAdd={addMore} onDone={() => finish(path)} onStartOver={() => startOverWish(true)} />}
      {screen === "summary" && (
        <Summary single={flowMoves === 1} wishText={wish.text} why={wish.why} path={path} paidShown={paidShown} onStartOver={() => startOverWish(true)}
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
