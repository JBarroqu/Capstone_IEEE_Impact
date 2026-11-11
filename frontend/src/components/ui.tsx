/* Components in the Event_Ecosystem design (docs/DESIGN.md). Colours come from tokens.css only. */
import { Link } from "react-router";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { Category, Tier } from "@/lib/types";

export function Panel({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-xl border border-border bg-panel px-[26px] pb-8 pt-[23px] ${className}`}>{children}</section>;
}

export function SubPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-subpanel px-[17px] pb-6 pt-4 ${className}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-white p-5 ${className}`}>{children}</div>;
}

export function PanelTitle({ children, count, right, as = "h2" }: { children: ReactNode; count?: number; right?: ReactNode; as?: "h1" | "h2" }) {
  const H = as;
  return (
    <div className="flex min-h-[47px] items-center gap-2">
      <H className="text-base font-bold tracking-[-0.48px] text-heading">{children}</H>
      {count !== undefined && <CountPill>{count}</CountPill>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-[-0.72px] text-navy">{children}</h1>
      {sub && <p className="text-[15px] text-secondary">{sub}</p>}
    </div>
  );
}

export function CountPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white px-3 py-0.5 text-xs tracking-[-0.36px] text-text">{children}</span>;
}

export function Divider() {
  return <hr className="my-5 h-px w-full border-0 bg-black" />;
}

type BtnKind = "primary" | "secondary" | "text" | "danger";
const BTN_BASE = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const BTN_KINDS: Record<BtnKind, string> = {
  primary: "bg-primary text-white hover:bg-heading",
  secondary: "border border-primary bg-white text-primary hover:bg-chip-active",
  text: "px-1 text-primary hover:opacity-60",
  danger: "border border-unread bg-white text-unread hover:bg-social-bg",
};

/** A link that looks like a button (never nest a <button> inside a link). */
export function ButtonLink({ to, kind = "primary", className = "", children }: { to: string; kind?: BtnKind; className?: string; children: ReactNode }) {
  return <Link to={to} className={`${BTN_BASE} ${BTN_KINDS[kind]} ${className}`}>{children}</Link>;
}

export function Button({ kind = "primary", className = "", busy, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; busy?: boolean }) {
  return <button type="button" className={`${BTN_BASE} ${BTN_KINDS[kind]} ${className}`} disabled={busy || p.disabled} {...p}>{busy ? "Working..." : children}</button>;
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" aria-pressed={!!on} onClick={onClick}
      className={`h-8 shrink-0 rounded-lg border px-3 text-center font-chip text-sm font-medium leading-5 tracking-[0.1px] transition-colors ${on ? "border-primary bg-chip-active text-primary" : "border-chip-border bg-transparent text-chip-text hover:bg-white"}`}>
      {children}
    </button>
  );
}

export function ChipRow({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="chip-scroll flex flex-wrap items-center gap-2 py-2" aria-label={label}>{children}</div>;
}

const CAT: Record<Category, { circle: string; icon?: string }> = {
  Social: { circle: "social-circle.svg", icon: "social.svg" },
  Pro: { circle: "pro-circle.svg", icon: "pro.svg" },
  Enablement: { circle: "enablement-circle.svg", icon: "enablement.svg" },
  Impact: { circle: "impact-circle.svg", icon: "impact.svg" },
  Events: { circle: "events-circle.svg" },
  Growth: { circle: "growth-circle.svg", icon: "growth.svg" },
};

export function CategoryIcon({ category, size = 50 }: { category: Category; size?: number }) {
  const c = CAT[category];
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <img className="absolute inset-0" style={{ width: size, height: size }} src={`/icons/${c.circle}`} alt="" />
      {c.icon && <img className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: size / 2, height: size / 2 }} src={`/icons/${c.icon}`} alt="" />}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "free" | "paid" | "growth" | "impact" | "pro" }) {
  const tones = {
    neutral: "bg-subpanel text-secondary", free: "bg-growth-bg text-growth", paid: "bg-impact-bg text-impact",
    growth: "bg-growth-bg text-growth", impact: "bg-impact-bg text-impact", pro: "bg-pro-bg text-pro",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

const TIER_TONE: Record<string, string> = {
  "Not started": "bg-subpanel text-secondary", Familiar: "bg-enablement-bg text-enablement", Proficient: "bg-growth-bg text-growth",
  Demonstrated: "bg-pro-bg text-pro", Verified: "bg-impact-bg text-impact",
};
export function TierBadge({ tier }: { tier: Tier | string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_TONE[tier] ?? TIER_TONE["Not started"]}`}>{tier}</span>;
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-chip-active" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

const fieldCls = "w-full rounded-lg border border-transparent bg-search px-4 py-2.5 text-[15px] tracking-[-0.45px] text-text outline-none placeholder:text-border focus:border-primary";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-navy">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-secondary">{hint}</span>}
      {error && <span className="text-xs font-semibold text-unread">{error}</span>}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${fieldCls} ${p.className ?? ""}`} />;
}

export function TextArea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={`${fieldCls} resize-y ${p.className ?? ""}`} />;
}

export function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** A list of short items typed one at a time (skills, interests, strengths). */
export function TagInput({ value, onChange, placeholder, max = 20 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().slice(0, 40);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg border border-primary bg-chip-active px-3 py-1 font-chip text-sm text-primary">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="ml-1 text-primary hover:opacity-60" onClick={() => onChange(value.filter((x) => x !== v))}>×</button>
          </span>
        ))}
      </div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className={fieldCls}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2.5 py-10 text-center text-[15px] text-secondary">{children}</p>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-skeleton ${className}`} />;
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-unread bg-white p-4 text-[15px] text-text" role="alert">
      <span>{children}</span>
      {onRetry && <Button kind="text" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
