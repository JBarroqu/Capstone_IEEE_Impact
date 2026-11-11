/* Reviewing a classmate's evidence. A reviewer rates 1-5 and confirms or not; that becomes SocialEvidence and
   finalises their points (D-13, D-19). A tester writes what they found. */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Chip, ChipRow, ErrorNote, Field, PageTitle, Panel, Skeleton, TextArea } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { track } from "@/lib/track";
import type { ReviewItem } from "@/lib/types";
import { EvidenceCard } from "@/modules/growth/EvidenceCard";

export default function ReviewPage() {
  const { invitationId = "" } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<ReviewItem | null | undefined>(undefined);
  const [rating, setRating] = useState<number | null>(null);
  const [confirms, setConfirms] = useState<boolean | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<{ queue: ReviewItem[] }>("/api/v1/reviews/queue").then((r) => setItem(r.queue.find((q) => q.invitationId === invitationId) ?? null)); }, [invitationId]);
  if (item === undefined) return <Skeleton className="h-64 w-full" />;
  if (item === null) return <ErrorNote>This review isn't available.</ErrorNote>;
  const reviewer = item.role === "reviewer";
  const ready = reviewer ? rating !== null && confirms !== null : body.trim().length > 0;
  const openFile = async () => { const r = await get<{ url: string }>(`/api/v1/evidence/${item.evidence!.id}/file-url`); window.open(r.url, "_blank", "noopener"); };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await post(`/api/v1/invitations/${invitationId}/feedback`, { evidenceId: item.evidence?.id, rating: reviewer ? rating : undefined, confirms: reviewer ? confirms : undefined, body });
      track("feedback_given", { role: item.role, rating, confirms });
      nav("/buddies");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't send."); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <PageTitle sub={`${item.owner?.displayName} asked you to ${reviewer ? "review" : "test"} this move.`}>{item.move?.title}</PageTitle>
      <Panel>
        <p className="mb-4 text-[15px] text-secondary">{item.move?.detail}</p>
        {item.evidence ? <EvidenceCard e={item.evidence} link={false} /> : <p className="text-secondary">No evidence submitted yet.</p>}
        {item.evidence?.hasFile && <Button kind="secondary" className="mt-3" onClick={openFile}>Open the file</Button>}
      </Panel>
      <Panel>
        {reviewer && <>
          <h2 className="text-base font-bold text-navy">How good is this work?</h2>
          <ChipRow>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={rating === n} onClick={() => setRating(n)}>{n}</Chip>)}</ChipRow>
          <p className="mb-4 text-xs text-secondary">1 = not there yet, 5 = excellent</p>
          <h2 className="text-base font-bold text-navy">Does the evidence show they did the move?</h2>
          <ChipRow><Chip on={confirms === true} onClick={() => setConfirms(true)}>Yes, I confirm it</Chip><Chip on={confirms === false} onClick={() => setConfirms(false)}>Not yet</Chip></ChipRow>
        </>}
        <div className="mt-3"><Field label={reviewer ? "Comment (optional)" : "What did you find when you tried it?"}><TextArea rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} /></Field></div>
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        <Button className="mt-4" disabled={!ready || !item.evidence && reviewer} busy={busy} onClick={submit}>Send feedback</Button>
      </Panel>
    </div>
  );
}
