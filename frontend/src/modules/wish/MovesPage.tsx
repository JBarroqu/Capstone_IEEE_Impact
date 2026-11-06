import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ButtonLink, Empty, PageTitle, Panel, PanelTitle, Skeleton, Tag } from "@/components/ui";
import { get } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";
import type { Wish } from "@/lib/types";

export default function MovesPage() {
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  useEffect(() => { get<{ wishes: Wish[] }>("/api/v1/wishes").then((r) => setWishes(r.wishes)); }, []);
  const active = wishes?.filter((w) => w.status === "active") ?? [];
  const done = wishes?.filter((w) => w.status !== "active") ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle sub="Each wish gets one move at a time. Do it, show what you made, and the next move builds on it.">Moves</PageTitle>
        <ButtonLink to="/moves/new">Start a wish</ButtonLink>
      </div>
      <Panel>
        <PanelTitle count={active.length}>Active wishes</PanelTitle>
        {wishes === null ? <Skeleton className="h-24 w-full" /> : active.length === 0 ? (
          <Empty>No active wishes. Start one to get your first move.</Empty>
        ) : (
          <ul className="flex flex-col">
            {active.map((w) => {
              const cur = w.moves[w.moves.length - 1];
              return (
                <li key={w.id}>
                  <Link to={`/moves/${w.id}`} className="flex flex-col gap-2 border-b border-black px-2.5 py-4 transition-colors hover:bg-white sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate font-semibold text-black">{w.text}</strong>
                      <span className="block truncate text-secondary">
                        {cur ? `Move ${cur.step}: ${cur.title}` : "No move picked yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {cur && <Tag tone={cur.status === "validated" ? "growth" : cur.status === "needs_work" ? "impact" : "neutral"}>{STATUS_LABEL[cur.status] ?? cur.status}</Tag>}
                      {w.nextOpen && <Tag tone="pro">{w.moves.length ? "Next move ready" : "Pick move 1"}</Tag>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {done.length > 0 && (
        <Panel>
          <PanelTitle count={done.length}>Closed wishes</PanelTitle>
          <ul>{done.map((w) => <li key={w.id}><Link className="block border-b border-black px-2.5 py-3 text-secondary hover:bg-white" to={`/moves/${w.id}`}>{w.text} · {w.moves.length} moves</Link></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}
