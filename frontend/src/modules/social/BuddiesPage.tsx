/* Module 4 (owner Michael Hawes): reviews waiting for you, invitations received and sent. */
import { useEffect, useState } from "react";
import { Button, ButtonLink, CategoryIcon, Chip, ChipRow, Empty, ErrorNote, PageTitle, Panel, PanelTitle, Tag } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Invitation, ReviewItem } from "@/lib/types";

export default function BuddiesPage() {
  const [tab, setTab] = useState<"reviews" | "received" | "sent">("reviews");
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [received, setReceived] = useState<Invitation[]>([]);
  const [sent, setSent] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    get<{ queue: ReviewItem[] }>("/api/v1/reviews/queue").then((r) => setQueue(r.queue));
    get<{ invitations: Invitation[] }>("/api/v1/invitations?box=received").then((r) => setReceived(r.invitations));
    get<{ invitations: Invitation[] }>("/api/v1/invitations?box=sent").then((r) => setSent(r.invitations));
  };
  useEffect(load, []);
  const act = async (id: string, action: string) => {
    setError(null);
    try { await post(`/api/v1/invitations/${id}/${action}`); load(); } catch (e) { setError(e instanceof ApiError ? e.message : "That didn't work."); }
  };
  const pending = received.filter((i) => i.status === "pending");
  const todo = queue.filter((q) => q.needsFeedback);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle sub="Review a classmate's move, or invite someone to review yours. A reviewer's confirmation finalises the points.">Buddies</PageTitle>
      <ChipRow label="Sections">
        <Chip on={tab === "reviews"} onClick={() => setTab("reviews")}>To review ({todo.length})</Chip>
        <Chip on={tab === "received"} onClick={() => setTab("received")}>Invitations ({pending.length})</Chip>
        <Chip on={tab === "sent"} onClick={() => setTab("sent")}>Sent</Chip>
      </ChipRow>
      {error && <ErrorNote>{error}</ErrorNote>}
      {tab === "reviews" && (
        <Panel>
          <PanelTitle count={queue.length}>Moves you support</PanelTitle>
          {queue.length === 0 ? <Empty>Nothing to review. Accept an invitation to help a classmate.</Empty> : (
            <ul>{queue.map((q) => (
              <li key={q.invitationId} className="flex items-center gap-4 border-b border-black px-2.5 py-3">
                <CategoryIcon category="Social" />
                <span className="min-w-0 flex-1"><strong className="block truncate font-semibold text-black">{q.move?.title}</strong>
                  <span className="block truncate text-secondary">{q.owner?.displayName} · {q.role}</span></span>
                {q.needsFeedback ? <ButtonLink to={`/buddies/review/${q.invitationId}`}>Review</ButtonLink>
                  : <Tag>{q.evidence ? "Reviewed" : "No evidence yet"}</Tag>}
              </li>
            ))}</ul>
          )}
        </Panel>
      )}
      {tab === "received" && (
        <Panel>
          <PanelTitle count={received.length}>Invitations</PanelTitle>
          {received.length === 0 ? <Empty>No invitations yet.</Empty> : (
            <ul>{received.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 border-b border-black px-2.5 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1"><strong className="block font-semibold text-black">{i.owner?.displayName} invited you as a {i.role}</strong>
                  <span className="block text-secondary">{i.move?.title}{i.message ? ` · "${i.message}"` : ""}</span></span>
                <span className="text-xs font-semibold text-time">{ago(i.createdAt)}</span>
                {i.status === "pending" ? <span className="flex gap-2"><Button onClick={() => act(i.id, "accept")}>Accept</Button><Button kind="secondary" onClick={() => act(i.id, "decline")}>Decline</Button></span>
                  : <Tag tone={i.status === "accepted" ? "growth" : "neutral"}>{i.status}</Tag>}
              </li>
            ))}</ul>
          )}
        </Panel>
      )}
      {tab === "sent" && (
        <Panel>
          <PanelTitle count={sent.length}>Invites you sent</PanelTitle>
          {sent.length === 0 ? <Empty>You haven't invited anyone yet. Invite a reviewer from one of your moves.</Empty> : (
            <ul>{sent.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 border-b border-black px-2.5 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1"><strong className="block font-semibold text-black">{i.buddy?.displayName} · {i.role}</strong><span className="block text-secondary">{i.move?.title}</span></span>
                <Tag tone={i.status === "accepted" ? "growth" : "neutral"}>{i.status}</Tag>
                {(i.status === "pending" || i.status === "accepted") && <Button kind="text" onClick={() => act(i.id, "revoke")}>Withdraw</Button>}
              </li>
            ))}</ul>
          )}
        </Panel>
      )}
    </div>
  );
}
