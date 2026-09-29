"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

/** Blue header band used on hero screens (intake, welcome, ...). Content sits in a centered column. */
export function Hero({ title, sub, onStartOver, children }: { title: string; sub?: string; onStartOver?: () => void; children?: ReactNode }) {
  return (
    <div className="bg-blue pb-14 pt-4">
      <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-5">
        <BrandRow onStartOver={onStartOver} light />
        <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] text-white sm:text-[36px]">{title}</h1>
        {sub && <p className="m-0 text-[15px] leading-[1.45] text-band-text">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function BrandRow({ onStartOver, light }: { onStartOver?: () => void; light?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cx("text-[17px] font-extrabold", light ? "text-white" : "text-blue")}>Wish Engine</span>
      {onStartOver && (
        <button type="button" onClick={onStartOver} className={cx("min-h-[44px] bg-transparent p-0 text-sm font-semibold underline", light ? "text-white" : "text-blue hover:text-ink")}>
          Start over
        </button>
      )}
    </div>
  );
}

/** Plain white screen with brand row. */
export function Page({ onStartOver, children }: { onStartOver?: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[600px] flex-col gap-5 px-5 pb-8 pt-4">
      <BrandRow onStartOver={onStartOver} />
      {children}
    </div>
  );
}

/** Content column that overlaps the hero band. */
export function HeroBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-6 px-5 pb-8">{children}</div>;
}

export function PrimaryButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cx("mt-auto flex h-[54px] w-full items-center justify-center rounded-full bg-ink text-base font-bold text-white hover:bg-blue-dark disabled:bg-check disabled:text-white", className)}
    />
  );
}

export function TextButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...p} className={cx("min-h-[44px] bg-transparent p-0 text-left text-[15px] font-bold text-blue hover:text-ink", className)} />;
}

export function Chip({ selected, dark, children, ...p }: { selected?: boolean; dark?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const on = selected ?? dark;
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...p}
      className={cx("min-h-[44px] rounded-full border-0 px-4 text-sm", on ? "bg-ink font-bold text-white" : "bg-tint font-semibold text-blue-dark hover:bg-[#d3eaf4]")}
    >
      {children}
    </button>
  );
}

export function Tag({ kind, children }: { kind: "time" | "free" | "paid"; children: ReactNode }) {
  const c = kind === "free" ? "bg-ok-bg text-ok" : kind === "paid" ? "bg-warn-bg text-warn" : "bg-chip text-muted";
  return <span className={cx("rounded-full px-[9px] py-[3px] text-xs font-bold", c)}>{children}</span>;
}

export function WishTile({ text, label = "Your wish" }: { text: string; label?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-tint px-3.5 py-3">
      <span className="text-xs font-bold text-blue-dark">{label}</span>
      <span className="text-[15px] font-bold">{text}</span>
    </div>
  );
}

export function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="m-0 text-[27px] font-extrabold leading-[1.1]">{title}</h1>
      {sub && <p className="m-0 text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field flex flex-col gap-1.5 rounded-[14px] border border-line2 bg-white px-4 py-3.5">
      <label htmlFor={id} className="text-[13px] font-bold text-blue-dark">{label}</label>
      {children}
    </div>
  );
}

export const textareaCls = "resize-none border-0 bg-transparent p-0 text-lg font-medium leading-[1.4] text-ink outline-none placeholder:text-muted/70";

/** Single-select row of pill buttons (radio semantics via aria-pressed). */
export function Choice<T extends string | number>({ value, options, onChange, label }: { value: T | undefined; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={String(o.v)} selected={value === o.v} onClick={() => onChange(o.v)}>{o.label}</Chip>
      ))}
    </div>
  );
}
