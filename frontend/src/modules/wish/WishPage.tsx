/* One wish: its moves in order (each with evidence and buddies), and the option picker when the next step is open
   (MOVES_PER_WISH, NEXT_MOVE_GATE: D-02, D-03). */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button, Chip, ChipRow, ErrorNote, Panel, PanelTitle, Skeleton, Tag } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { STATUS_LABEL } from "@/lib/format";
import { track } from "@/lib/track";
import type { Evidence, SelectedSummary, Wish } from "@/lib/types";
import { EvidenceCard } from "@/modules/growth/EvidenceCard";
import { EvidenceForm } from "@/modules/growth/EvidenceForm";
import { BuddyPanel } from "@/modules/social/BuddyPanel";
import { MoveTags, Pick } from "./Pick";

const GATE_TEXT: Record<string, string> = {
  validated: "Your next move opens when this one's evidence is validated.",
  ai_scored: "Your next move opens once this one's evidence is scored.",
  submitted: "Your next move opens once you submit evidence for this one.",
  none: "",
};

function Rating({ wishId, step }: { wishId: string; step: number }) {
  const [done, setDone] = useState<number | null>(null);
  return (
    <div className="rounded-lg bg-white p-5">
      <h3 className="mb-2 text-base font-bold text-navy">How useful is this move for your wish?</h3>
      <ChipRow>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={done === n} onClick={() => { setDone(n); track("path_rated", { rating: n }, step, wishId); }}>{n}</Chip>)}</ChipRow>
      <p className="text-xs text-secondary">1 = not useful, 5 = very useful</p>
    </div>
  );
}

function MoveBlock({ m, wishId, focus, onChange }: { m: SelectedSummary; wishId: string; focus: boolean; onChange: () => void }) {
  const { policy } = useConfig();
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => get<{ evidence: Evidence[] }>(`/api/v1/evidence?selectedMoveId=${m.selectedMoveId}`).then((r) => setEvidence(r.evidence)), [m.selectedMoveId]);
  useEffect(() => { void load(); }, [load, m.status]);
  useEffect(() => {
    if (!evidence?.some((e) => e.status === "scoring")) return;
    const t = setInterval(() => { void load(); onChange(); }, 2500);
    return () => clearInterval(t);
  }, [evidence, load, onChange]);
  const latest = evidence?.[0];
  const canSubmit = m.status === "active" || m.status === "needs_work";
  const closed = m.status === "abandoned";
  return (
    <div id={`move-${m.selectedMoveId}`} className={`flex flex-col gap-3 rounded-xl border p-5 ${focus ? "border-primary bg-chip-active" : "border-border bg-subpanel"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{m.step}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-6 text-black">{m.title}</h3>
          <p className="mb-2 text-[15px] text-secondary">{m.detail}</p>
          <MoveTags m={{ minutes: m.minutes, cost: m.cost as "free" | "paid", activityType: m.activityType, difficulty: m.difficulty, skillId: m.skillId }} />
        </div>
        <Tag tone={m.status === "validated" ? "growth" : m.status === "needs_work" ? "impact" : "neutral"}>{STATUS_LABEL[m.status] ?? m.status}</Tag>
      </div>
      {evidence === null ? <Skeleton className="h-16 w-full" /> : evidence.map((e) => <EvidenceCard key={e.id} e={e} />)}
      {canSubmit && !closed && <EvidenceForm selectedMoveId={m.selectedMoveId} revisionOf={m.status === "needs_work" ? latest?.id : undefined}
        onSubmitted={() => { void load(); onChange(); }} />}
      {!closed && <BuddyPanel selectedMoveId={m.selectedMoveId} open={m.status !== "validated"} />}
      {m.status === "active" && policy("SURVEY_SCREENS") === "on" && <Rating wishId={wishId} step={m.step} />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {canSubmit && (
        <Button kind="text" className="self-start text-sm" onClick={async () => {
          try { await post(`/api/v1/selected-moves/${m.selectedMoveId}/abandon`); onChange(); } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't close it."); }
        }}>Drop this move and pick another</Button>
      )}
    </div>
  );
}

export default function WishPage() {
  const { wishId = "" } = useParams();
  const [params] = useSearchParams();
  const { policy } = useConfig();
  const [wish, setWish] = useState<Wish | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => get<{ wish: Wish }>(`/api/v1/wishes/${wishId}`).then((r) => setWish(r.wish)).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this wish.")), [wishId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = params.get("move");
    if (id && wish) document.getElementById(`move-${id}`)?.scrollIntoView({ behavior: "smooth" });
  }, [params, wish]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!wish) return <div className="flex flex-col gap-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-48 w-full" /></div>;
  const moves = wish.moves;
  const last = moves[moves.length - 1];
  const maxSteps = policy("MAX_STEPS_PER_WISH") ?? 5;
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/moves" className="text-sm font-semibold text-primary hover:opacity-60">All wishes</Link>
        <div className="rounded-lg bg-chip-active px-5 py-4"><span className="block text-xs font-semibold text-primary">Your wish</span><h1 className="text-xl font-bold tracking-[-0.6px] text-navy">{wish.text}</h1></div>
      </div>
      <Panel>
        <PanelTitle count={moves.length}>Your moves</PanelTitle>
        <div className="flex flex-col gap-4">
          {moves.map((m) => <MoveBlock key={m.selectedMoveId} m={m} wishId={wish.id} focus={params.get("move") === m.selectedMoveId} onChange={load} />)}
          {wish.status === "active" && wish.nextOpen && (
            <div className="rounded-xl border border-border bg-white p-5"><Pick key={wish.nextStep} wishId={wish.id} step={wish.nextStep} onLocked={() => void load()} /></div>
          )}
          {wish.status === "active" && !wish.nextOpen && last && moves.length < maxSteps && (
            <p className="text-sm text-secondary">{GATE_TEXT[policy("NEXT_MOVE_GATE") ?? "validated"]}</p>
          )}
          {moves.length >= maxSteps && <p className="text-sm text-secondary">That's the full path for this wish.</p>}
        </div>
      </Panel>
      {wish.status === "active" && (
        <Button kind="text" className="self-start" onClick={async () => { await post(`/api/v1/wishes/${wish.id}/status`, { status: "completed" }); void load(); }}>
          Mark this wish complete
        </Button>
      )}
    </div>
  );
}
