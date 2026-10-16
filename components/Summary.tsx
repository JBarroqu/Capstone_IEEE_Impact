"use client";
import { useState } from "react";
import { Choice, Field, Heading, Page, PrimaryButton, Tag, WishTile, textareaCls } from "./ui";
import type { Move } from "@/lib/types";

export type FeedbackAnswers = { rating: number; doThisWeek?: string; paid: Record<string, string>; open?: string };

export function Summary({ single, wishText, why, path, paidShown, onStartOver, onSubmit }: {
  single?: boolean; wishText: string; why?: string; path: Move[]; paidShown: Move[]; onStartOver: () => void; onSubmit: (a: FeedbackAnswers) => void;
}) {
  const [rating, setRating] = useState<number>();
  const [week, setWeek] = useState<string>();
  const [paid, setPaid] = useState<Record<string, string>>({});
  const [open, setOpen] = useState("");
  const yn = [{ v: "yes", label: "Yes" }, { v: "maybe", label: "Maybe" }, { v: "no", label: "No" }];
  return (
    <Page onStartOver={onStartOver}>
      <Heading title={single ? "Your first move" : "Your path"} sub={single ? "One quick question about it." : undefined} />
      <WishTile text={wishText} />
      {why && <WishTile label="Why" text={why} />}
      {path.length ? (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {path.map((m, i) => (
            <li key={m.id} className="flex gap-3 rounded-[14px] border-[1.5px] border-line p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">{i + 1}</span>
              <span className="flex flex-col gap-1.5">
                <span className="text-base font-bold leading-[1.3]">{m.title}</span>
                <span className="text-sm text-muted">{m.detail}</span>
                <span className="flex gap-1.5"><Tag kind="time">{m.minutes < 60 ? `${m.minutes} min` : `${Math.round(m.minutes / 6) / 10} hr`}</Tag><Tag kind={m.cost}>{m.cost === "free" ? "Free" : "Paid"}</Tag></span>
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="m-0 text-muted">No moves were locked in this time.</p>}

      <hr className="w-full border-line2" />
      <section className="flex flex-col gap-2.5" aria-labelledby="f1">
        <h2 id="f1" className="m-0 text-base font-extrabold">{single ? (path.length ? "How useful is this move for your wish?" : "How useful were the options you saw?") : "How useful is this path?"}</h2>
        <Choice label="Rating from 1 to 5" value={rating} onChange={setRating} options={[1, 2, 3, 4, 5].map((n) => ({ v: n, label: String(n) }))} />
        <p className="m-0 text-[13px] text-muted">1 = not useful, 5 = very useful</p>
      </section>
      {!single && path[0] && (
        <section className="flex flex-col gap-2.5" aria-labelledby="f2">
          <h2 id="f2" className="m-0 text-base font-extrabold">{single ? "Would you actually do it this week?" : "Would you actually do move 1 this week?"}</h2>
          <Choice label="Would do move 1 this week" value={week} onChange={setWeek} options={yn} />
        </section>
      )}
      {!single && paidShown.map((m) => (
        <section key={m.id} className="flex flex-col gap-2.5" aria-label={`Would you pay for ${m.title}`}>
          <h2 className="m-0 text-base font-extrabold">Would you pay for &ldquo;{m.title}&rdquo;?</h2>
          <Choice label={`Would pay for ${m.title}`} value={paid[m.id]} onChange={(v) => setPaid({ ...paid, [m.id]: v })} options={yn} />
        </section>
      ))}
      {!single && (
        <Field id="open" label="Anything confusing or missing? (optional)">
          <textarea id="open" rows={3} maxLength={1000} value={open} onChange={(e) => setOpen(e.target.value)} className={textareaCls} />
        </Field>
      )}
      <PrimaryButton disabled={!rating} onClick={() => onSubmit({ rating: rating!, doThisWeek: week, paid, open: open.trim() || undefined })}>Submit</PrimaryButton>
    </Page>
  );
}
