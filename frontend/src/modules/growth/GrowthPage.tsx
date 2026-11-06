/* Module 3 (owner Christina Phan): Impact Score, per-skill tiers with the gates still to meet, unlocks, badges, ledger. */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CategoryIcon, Divider, Empty, PageTitle, Panel, PanelTitle, Progress, Skeleton, SubPanel, Tag, TierBadge } from "@/components/ui";
import { get } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { ago, pts } from "@/lib/format";
import type { Evidence, GrowthState } from "@/lib/types";

type Ledger = { id: string; kind: string; points: number; skillId: string | null; reason: string; createdAt: string };

export default function GrowthPage() {
  const { catalog, policy } = useConfig();
  const [g, setG] = useState<GrowthState | null>(null);
  const [ev, setEv] = useState<Evidence[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  useEffect(() => {
    get<{ growth: GrowthState }>("/api/v1/growth").then((r) => setG(r.growth));
    get<{ evidence: Evidence[] }>("/api/v1/evidence").then((r) => setEv(r.evidence));
    get<{ events: Ledger[] }>("/api/v1/score-events").then((r) => setLedger(r.events));
  }, []);
  if (!g) return <div className="flex flex-col gap-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  const career = catalog?.careers.find((c) => c.id === g.careerId);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle sub={career ? `Tracked against ${career.name}. Scoring rules ${g.rulesVersion}.` : "Choose a target career on your profile to track skills."}>Growth</PageTitle>
      <div className="grid gap-8 lg:grid-cols-[424px_minmax(0,738px)]">
        <aside className="flex flex-col gap-5 rounded-xl border border-border bg-panel px-4 pb-8 pt-[31px]">
          <div className="text-center">
            <strong className="block text-[32px] font-bold leading-[1.5] tracking-[-0.96px] text-primary">{pts(g.totals.impact)}</strong>
            <span className="block text-xs tracking-[-0.36px] text-text">Impact Score</span>
            <span className="mt-1 block text-xs text-secondary">Validated points plus counted effort (effort is capped).</span>
          </div>
          <Divider />
          <SubPanel>
            <h2 className="mb-3 text-base font-bold text-primary">Points</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-secondary">Validated</dt><dd className="text-right font-semibold">{pts(g.totals.validated)}</dd>
              <dt className="text-secondary">Pending review</dt><dd className="text-right font-semibold">{pts(g.totals.pending)}</dd>
              <dt className="text-secondary">Effort counted</dt><dd className="text-right font-semibold">{pts(g.totals.effortCounted)}</dd>
              <dt className="text-secondary">Effort banked</dt><dd className="text-right font-semibold">{pts(g.totals.effortBanked)}</dd>
              <dt className="text-secondary">Role tier</dt><dd className="text-right"><TierBadge tier={g.roleTier} /></dd>
            </dl>
            {g.totals.pending > 0 && !policy("PROVISIONAL_COUNTS") && <p className="mt-3 text-xs text-secondary">Pending points count once a reviewer confirms them.</p>}
          </SubPanel>
          <SubPanel>
            <h2 className="mb-3 text-base font-bold text-primary">Badges</h2>
            <ul className="grid grid-cols-2 gap-2">{g.badges.map((b) => (
              <li key={b.id} className={`rounded-lg bg-white p-3 text-sm ${b.earned ? "" : "opacity-55"}`}><strong className="block">{b.name}</strong><span className="text-xs text-secondary">{b.earned ? b.rarity : b.description}</span></li>
            ))}</ul>
          </SubPanel>
        </aside>
        <section className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelTitle count={g.skills.length}>Skills</PanelTitle>
            {g.skills.length === 0 ? <Empty>No skills yet. <Link className="text-primary" to="/profile">Choose a target career.</Link></Empty> : (
              <ul className="flex flex-col">
                {g.skills.map((s) => (
                  <li key={s.skillId} className="flex flex-col gap-2 border-b border-black px-2.5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-semibold text-black">{s.name}</strong>
                      {s.core && <Tag>core</Tag>}
                      <TierBadge tier={s.tier} />
                      <span className="ml-auto text-sm font-semibold text-time">{pts(s.points)}{s.nextThreshold ? ` / ${s.nextThreshold}` : ""} pts{s.pendingPoints ? ` · ${pts(s.pendingPoints)} pending` : ""}</span>
                    </div>
                    {s.nextTier && <>
                      <Progress value={s.progress} label={`${s.name} progress to ${s.nextTier}`} />
                      <p className="text-xs text-secondary">For {s.nextTier}: {s.gates.map((x) => `${x.met ? "done" : "needs"} ${x.rule}`).join(" · ")}</p>
                    </>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel id="opportunities">
            <PanelTitle count={g.unlocks.length}>Opportunities</PanelTitle>
            <ul className="flex flex-col">
              {[...g.unlocks.map((u) => ({ ...u, on: true })), ...g.lockedOpportunities.map((u) => ({ ...u, on: false }))].map((u) => (
                <li key={u.opportunityId} className={`flex items-center gap-4 border-b border-black px-2.5 py-3 ${u.on ? "" : "opacity-55"}`}>
                  <CategoryIcon category="Enablement" />
                  <span className="min-w-0 flex-1"><strong className="block font-semibold text-black">{u.title}</strong><span className="block text-secondary">{u.description}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><TierBadge tier={u.tier} /><span className="text-xs text-secondary">{u.on ? "Unlocked" : "Locked"}</span></span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelTitle count={ev.length}>Evidence</PanelTitle>
            {ev.length === 0 ? <Empty>No evidence yet. Do a move and show what you made.</Empty> : (
              <ul>{ev.map((e) => (
                <li key={e.id}><Link to={`/growth/evidence/${e.id}`} className="flex items-center gap-3 border-b border-black px-2.5 py-3 hover:bg-white">
                  <span className="min-w-0 flex-1 truncate">{e.summary}</span><Tag tone={e.status === "validated" ? "growth" : "neutral"}>{e.status.replace("_", " ")}</Tag>
                  <span className="hidden text-xs font-semibold text-time sm:inline">{ago(e.createdAt)}</span>
                </Link></li>
              ))}</ul>
            )}
          </Panel>
          <Panel>
            <PanelTitle>Points ledger</PanelTitle>
            <div className="notification-list max-h-[320px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-secondary"><th className="py-2">When</th><th>Kind</th><th>Skill</th><th>Reason</th><th className="text-right">Points</th></tr></thead>
                <tbody>{ledger.map((l) => <tr key={l.id} className="border-t border-subpanel"><td className="py-2 text-time">{ago(l.createdAt)}</td><td>{l.kind}</td><td>{l.skillId ?? ""}</td><td>{l.reason.replace(/_/g, " ")}</td><td className="text-right font-semibold">{pts(l.points)}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}
