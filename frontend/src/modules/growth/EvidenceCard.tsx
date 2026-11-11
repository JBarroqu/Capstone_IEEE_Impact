import { useState } from "react";
import { Link } from "react-router";
import { Button, Progress, Tag } from "@/components/ui";
import { post } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { ago, pts, STATUS_LABEL } from "@/lib/format";
import type { Evidence } from "@/lib/types";

const CRITERIA = ["relevance", "completeness", "quality", "clarity"];

export function RubricBars({ criteria }: { criteria: Record<string, number> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CRITERIA.filter((k) => k in criteria).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="flex justify-between text-xs text-secondary"><span className="capitalize">{k}</span><span>{criteria[k].toFixed(2)}</span></span>
          <Progress value={criteria[k]} label={k} />
        </div>
      ))}
    </div>
  );
}

/** D-45 suggest: validated evidence is offered as a verified contribution on the owner's profile. onProfile is only
    present in the owner's own evidence list, so buddies never see the offer. */
function AddToProfile({ e }: { e: Evidence }) {
  const { policy } = useConfig();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  if (e.status !== "validated" || e.onProfile !== false || policy("CONTRIBUTION_FROM_EVIDENCE") !== "suggest") return null;
  if (added) return <p className="text-sm text-growth">Added to your profile as a verified contribution.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-growth-bg p-3 text-sm">
      <span className="flex-1 text-text">Feature this on your profile as a verified contribution?</span>
      <Button kind="secondary" busy={busy} onClick={async () => { setBusy(true); try { await post(`/api/v1/evidence/${e.id}/add-to-profile`); setAdded(true); } finally { setBusy(false); } }}>Add to profile</Button>
    </div>
  );
}

/** Evidence status, rubric and points. Text from the rubric is shown as plain text, never HTML. */
export function EvidenceCard({ e, link = true }: { e: Evidence; link?: boolean }) {
  const tone = e.status === "validated" ? "growth" : e.status === "needs_work" || e.status === "ai_error" ? "impact" : "neutral";
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={tone}>{STATUS_LABEL[e.status] ?? e.status}</Tag>
        {e.status === "validated" && <Tag tone="growth">{pts(e.points)} points{e.peerConfirmed === false ? " · not peer-confirmed" : e.peerConfirmed ? " · peer-confirmed" : ""}</Tag>}
        {e.status === "awaiting_review" && e.pendingPoints != null && <Tag tone="pro">{pts(e.pendingPoints)} pending</Tag>}
        <span className="ml-auto text-xs font-semibold text-time">{ago(e.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[15px] text-text">{e.summary}</p>
      {e.artifactUrl && <a className="truncate text-sm text-primary hover:opacity-60" href={e.artifactUrl} target="_blank" rel="noreferrer noopener">{e.artifactUrl}</a>}
      {e.status === "scoring" && <p className="text-sm text-secondary">Scoring... this takes a few seconds.</p>}
      {e.aiScore != null && <>
        <RubricBars criteria={e.aiCriteria} />
        {e.aiFeedback && <p className="whitespace-pre-wrap rounded-lg bg-subpanel p-3 text-sm text-text">{e.aiFeedback}</p>}
      </>}
      <AddToProfile e={e} />
      {link && <Link to={`/growth/evidence/${e.id}`} className="self-start text-sm font-semibold text-primary hover:opacity-60">Open</Link>}
    </div>
  );
}
