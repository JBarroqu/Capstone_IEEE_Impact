/* Wish Engine intake (Module 2): wish -> why and prior attempts -> three generated follow-up questions. Classification
   runs in the background while the student keeps going; the keyword classifier answers if every model fails. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Chip, ChipRow, ErrorNote, Field, Panel, Skeleton, TextArea } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { track } from "@/lib/track";
import { uuid } from "@/lib/uuid";

type Classified = { type: string; focus: string[]; domains: string[]; source: string };
type Question = { id: string; prompt: string; note: string; answers: { id: string; label: string }[] };
const PRIOR_CHIPS = ["Online course", "YouTube", "A club", "Nothing yet"];

export default function NewWish() {
  const nav = useNavigate();
  const wishId = useRef(uuid());
  const [screen, setScreen] = useState<"intake" | "why" | "questions">("intake");
  const [text, setText] = useState("");
  const [chips, setChips] = useState<{ id: string; text: string; chip?: boolean }[]>([]);
  const [fromChip, setFromChip] = useState(false);
  const [why, setWhy] = useState("");
  const [prior, setPrior] = useState<string[]>([]);
  const [tried, setTried] = useState("");
  const [qs, setQs] = useState<Question[] | null>(null);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<{ question: string; answer: string; note: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const classified = useRef<Promise<Classified> | null>(null);

  useEffect(() => { get<{ chips: { id: string; text: string; chip?: boolean }[] }>("/api/v1/chips").then((r) => setChips(r.chips.filter((c) => c.chip).slice(0, 8))).catch(() => {}); }, []);

  const save = (fields: Record<string, unknown>) => post("/api/v1/wishes", { id: wishId.current, ...fields }, 4).catch(() => {});

  const submitWish = async () => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    try {
      await post("/api/v1/wishes", { id: wishId.current, text: t, fromChip }, 3);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save your wish."); return; }
    track("wish_submitted", { text_length: t.length, from_chip: fromChip }, null, wishId.current);
    classified.current = post<Classified>("/api/v1/classify", { wishText: t }, 2).then((c) => {
      track("classification_guessed", { focus: c.focus, domains: c.domains, type: c.type, source: c.source }, null, wishId.current);
      void save({ type: c.type, focus: c.focus, domains: c.domains, guessedType: c.type, guessedFocus: c.focus, guessedDomains: c.domains });
      return c;
    }).catch(() => ({ type: "open_ended", focus: [], domains: [], source: "none" }));
    setScreen("why");
  };

  const submitWhy = async (skip: boolean) => {
    const priorAttempts = skip ? { chips: [] } : { chips: prior, text: tried.trim() || undefined };
    if (!skip) {
      void save({ why: why.trim() || undefined, priorAttempts });
      track("why_submitted", { length: why.trim().length }, null, wishId.current);
    }
    setScreen("questions");
    const c = await classified.current!;
    try {
      const r = await post<{ source: string; questions: Question[] }>("/api/v1/questions", {
        wishText: text.trim(), type: c.type, focus: c.focus, domains: c.domains, why: skip ? undefined : why.trim() || undefined, prior: priorAttempts,
      }, 2);
      track("questions_shown", { source: r.source, questions: r.questions.map((q) => q.prompt) }, null, wishId.current);
      setQs(r.questions);
    } catch { finish([]); }
  };

  const answer = (q: Question, a: { id: string; label: string }) => {
    const next = [...answers, { question: q.prompt, answer: a.label, note: q.note }];
    setAnswers(next);
    track("quiz_answered", { q: q.id, answer: a.id, question: q.prompt, answer_text: a.label }, null, wishId.current);
    if (qi + 1 < (qs?.length ?? 0)) setQi(qi + 1); else finish(next);
  };

  const finish = async (followUps: typeof answers) => {
    if (followUps.length) await save({ followUps });
    nav(`/moves/${wishId.current}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-[680px]">
      {screen === "intake" && (
        <Panel>
          <h1 className="mb-1 text-2xl font-bold tracking-[-0.72px] text-navy">What do you want to make happen?</h1>
          <p className="mb-5 text-[15px] text-secondary">Tell us one goal. You'll get three first moves sized for this week, and you pick.</p>
          <Field label="Your wish"><TextArea rows={3} maxLength={300} value={text} placeholder="e.g. Land a new-grad SWE offer" onChange={(e) => { setText(e.target.value); setFromChip(false); }} /></Field>
          {chips.length > 0 && <>
            <h2 className="mt-5 text-sm font-semibold text-navy">Popular with students</h2>
            <ChipRow>{chips.map((c) => <Chip key={c.id} on={text === c.text} onClick={() => { setText(c.text); setFromChip(true); }}>{c.text}</Chip>)}</ChipRow>
          </>}
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <Button className="mt-6 w-full" disabled={!text.trim()} onClick={submitWish}>Continue</Button>
        </Panel>
      )}
      {screen === "why" && (
        <Panel>
          <p className="mb-3 rounded-lg bg-chip-active px-4 py-3 text-sm"><span className="block text-xs font-semibold text-primary">Your wish</span><strong>{text}</strong></p>
          <h1 className="mb-1 text-2xl font-bold tracking-[-0.72px] text-navy">A bit of context</h1>
          <p className="mb-5 text-[15px] text-secondary">Both are optional. Skip if you like.</p>
          <Field label="Why do you want this?"><TextArea rows={2} maxLength={400} value={why} placeholder="One or two sentences" onChange={(e) => setWhy(e.target.value)} /></Field>
          <h2 className="mt-5 text-sm font-semibold text-navy">Have you already tried something for this that you didn't like?</h2>
          <ChipRow>{PRIOR_CHIPS.map((c) => { const k = c.toLowerCase(); return <Chip key={c} on={prior.includes(k)} onClick={() => setPrior((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])}>{c}</Chip>; })}</ChipRow>
          <div className="mt-3"><Field label="What happened? (optional)"><TextArea rows={2} maxLength={400} value={tried} onChange={(e) => setTried(e.target.value)} /></Field></div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button kind="text" onClick={() => submitWhy(true)}>Skip</Button>
            <Button onClick={() => submitWhy(false)}>Continue</Button>
          </div>
        </Panel>
      )}
      {screen === "questions" && (
        <Panel>
          {!qs ? (
            <div aria-busy="true">
              <h1 className="mb-1 text-2xl font-bold tracking-[-0.72px] text-navy">A few questions about your wish</h1>
              <p className="mb-5 text-[15px] text-secondary">Writing three quick questions for your wish...</p>
              <div className="flex flex-col gap-2.5"><Skeleton className="h-7 w-4/5" />{[0, 1, 2].map((n) => <Skeleton key={n} className="h-14 w-full" />)}</div>
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${qs.length}, 1fr)` }}>{qs.map((q, n) => <span key={q.id} className={`h-1.5 rounded-full ${n <= qi ? "bg-primary" : "bg-white"}`} />)}</div>
              <span className="text-xs font-semibold text-secondary">Question {qi + 1} of {qs.length}</span>
              <h1 className="mb-5 mt-1 text-xl font-bold tracking-[-0.6px] text-navy">{qs[qi].prompt}</h1>
              <div className="flex flex-col gap-2.5">
                {qs[qi].answers.map((a) => (
                  <button key={a.id} type="button" onClick={() => answer(qs[qi], a)}
                    className="min-h-14 rounded-lg border border-border bg-white px-4 py-3 text-left text-base font-semibold text-navy transition-colors hover:border-primary hover:bg-chip-active">{a.label}</button>
                ))}
              </div>
              <Button kind="text" className="mt-5" onClick={() => { track("quiz_skipped", { answered: answers.length }, null, wishId.current); finish(answers); }}>Skip these questions</Button>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
