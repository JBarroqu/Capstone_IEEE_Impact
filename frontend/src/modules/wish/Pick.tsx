/* The Wish Engine's option picker (Module 2), restyled: three generated options, reject with a reason to get a
   different set, lock one in. Every option is model-generated (D-29); a failure shows a retry, never fixed moves. */
import { useEffect, useRef, useState } from "react";
import { Button, Chip, ChipRow, ErrorNote, Field, Skeleton, Tag, TextArea } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { minutesLabel } from "@/lib/format";
import { track } from "@/lib/track";
import type { Move, OptionsMeta, SelectedMove, Skill } from "@/lib/types";

const REJECT_CHIPS = ["Too big", "Too small", "Not my style", "Already done this", "Don't want to pay", "Other"];
const SUB: Record<number, string> = {
  1: "Small and quick. Which one would you actually do this week?",
  2: "Builds on what move 1 showed you. Which one fits next?",
  3: "The version you'll actually ship. Which one?",
  4: "One more move to extend your path.",
  5: "A last move to round it out.",
};
const ORD = ["first", "second", "third", "fourth", "fifth"];
const ACTIVITY: Record<string, string> = { explore: "Explore", create: "Create", test: "Test", share: "Share", connect: "Connect", enable: "Enable" };

export function MoveTags({ m, skills }: { m: Pick<Move, "minutes" | "cost" | "activityType" | "difficulty" | "skillId">; skills?: Skill[] }) {
  const { catalog } = useConfig();
  const all = skills ?? catalog?.careers.flatMap((c) => c.skills) ?? [];
  const skill = all.find((s) => s.id === m.skillId)?.name ?? m.skillId?.replace(/_/g, " ");
  return (
    <span className="flex flex-wrap gap-1.5">
      <Tag>{minutesLabel(m.minutes)}</Tag>
      <Tag tone={m.cost === "free" ? "free" : "paid"}>{m.cost === "free" ? "Free" : "Paid"}</Tag>
      <Tag tone="pro">{ACTIVITY[m.activityType] ?? m.activityType}</Tag>
      <Tag>{m.difficulty}</Tag>
      {skill && <Tag tone="growth">{skill}</Tag>}
    </span>
  );
}

export function Pick({ wishId, step, onLocked, onShown }: { wishId: string; step: number; onLocked: (sm: SelectedMove) => void; onShown?: (moves: Move[]) => void }) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reroll, setReroll] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const shownAt = useRef(0);
  const shownIds = useRef<string[]>([]);
  const rejectedBefore = useRef<{ reason?: string; text?: string; moveIds: string[] }[]>([]);
  const last = useRef<{ reason?: { chip?: string; text?: string }; ids?: string[] }>({});
  const started = useRef(false);

  async function load(r: number, reason?: { chip?: string; text?: string }, rejectedIds?: string[]) {
    last.current = { reason, ids: rejectedIds };
    setMoves(null); setError(null); setSelected(null);
    try {
      const res = await post<{ moves: Move[]; meta: OptionsMeta; skills: Skill[] }>(`/api/v1/wishes/${wishId}/options`,
        { step, rerollIndex: r, rejectedMoveIds: rejectedIds ?? [], rejectReason: reason }, 1);
      shownAt.current = Date.now();
      shownIds.current = [...shownIds.current, ...res.moves.map((m) => m.id)];
      setReroll(r); setMoves(res.moves); setSkills(res.skills); onShown?.(res.moves);
      const meta = res.meta;
      track("options_shown", {
        move_ids: res.moves.map((m) => m.id), reroll_index: r, relaxed: meta.relaxed, sources: meta.sources,
        requested_provider: meta.requestedProvider, used_provider: meta.usedProvider, model: meta.model ?? null,
        prompt_version: meta.promptVersion ?? null, latency_ms: meta.latencyMs, cache_hit: meta.cacheHit, repaired: meta.repaired, tried: meta.tried ?? [],
      }, step, wishId);
    } catch (e) {
      track("options_failed", { reason: e instanceof ApiError ? String(e.body.reason ?? e.status) : "network", reroll_index: r }, step, wishId);
      setError(e instanceof ApiError && e.status === 409 ? e.message : "We couldn't load your options this time. Nothing you entered was lost.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ms = () => Date.now() - shownAt.current;
  const lock = async () => {
    const pos = moves!.findIndex((m) => m.id === selected);
    if (pos < 0) return;
    setLocking(true);
    track("move_locked", { move_id: selected, position: pos, ms_since_shown: ms(), reroll_index: reroll }, step, wishId);
    try {
      const r = await post<{ selectedMove: SelectedMove }>(`/api/v1/wishes/${wishId}/select`, {
        moveId: selected, msSinceShown: ms(), shownMoveIds: shownIds.current, rejectedBefore: rejectedBefore.current,
      }, 2);
      onLocked(r.selectedMove);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't lock that move. Try again.");
    } finally { setLocking(false); }
  };
  const reject = () => {
    const ids = (moves ?? []).map((m) => m.id);
    track("options_rejected", { reason_chip: chip, text: why || null, move_ids: ids }, step, wishId);
    rejectedBefore.current.push({ reason: chip ?? undefined, text: why || undefined, moveIds: ids });
    setSheet(false);
    void load(reroll + 1, { chip: chip?.toLowerCase() ?? undefined, text: why || undefined }, ids);
    setChip(null); setWhy("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.6px] text-navy">Pick your {ORD[step - 1]} move</h2>
        <p className="text-[15px] text-secondary">{SUB[step]}</p>
      </div>
      {error ? <ErrorNote onRetry={() => load(reroll, last.current.reason, last.current.ids)}>{error}</ErrorNote>
        : moves === null ? (
          <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading options">
            {[0, 1, 2].map((i) => <div key={i} className="flex h-[112px] flex-col justify-center gap-3 rounded-lg bg-white px-5"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-1/2" /></div>)}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {moves.map((m, i) => {
              const on = selected === m.id;
              return (
                <button key={m.id} type="button" aria-pressed={on}
                  onClick={() => { setSelected(on ? null : m.id); track(on ? "option_deselected" : "option_selected", { move_id: m.id, position: i, ms_since_shown: ms() }, step, wishId); }}
                  className={`flex items-center gap-4 rounded-lg px-5 py-4 text-left transition-colors ${on ? "border-2 border-primary bg-chip-active" : "border border-border bg-white hover:border-primary"}`}>
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="text-base font-semibold leading-6 text-black">{m.title}</span>
                    <span className="text-[15px] leading-6 text-secondary">{m.detail}</span>
                    <MoveTags m={m} skills={skills} />
                  </span>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${on ? "bg-primary" : "border-2 border-border"}`}>
                    {on && <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4,13 9,18 20,6" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      {moves && !sheet && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button kind="text" onClick={() => setSheet(true)}>None of these fit</Button>
          <Button disabled={!selected} busy={locking} onClick={lock}>Lock in move {step}</Button>
        </div>
      )}
      {sheet && (
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="text-base font-bold text-navy">What was off?</h3>
          <ChipRow>{REJECT_CHIPS.map((c) => <Chip key={c} on={chip === c} onClick={() => setChip(chip === c ? null : c)}>{c}</Chip>)}</ChipRow>
          <Field label="Anything else? (optional)"><TextArea rows={2} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <div className="mt-4 flex justify-end gap-3"><Button kind="secondary" onClick={() => setSheet(false)}>Cancel</Button><Button onClick={reject}>Show different options</Button></div>
        </div>
      )}
    </div>
  );
}
