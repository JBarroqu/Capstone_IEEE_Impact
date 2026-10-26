"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, PrimaryButton, textareaCls } from "../ui";

export function AdminLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) return router.refresh();
    const j = await r.json().catch(() => ({}));
    setErr(r.status === 429 ? "Too many attempts. Wait a few minutes." : j.error ?? "Sign-in failed.");
  };
  return (
    <form onSubmit={submit} className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-4 px-5">
      <span className="text-[17px] font-extrabold text-blue">Wish Engine admin</span>
      <Field id="pw" label="Password">
        <input id="pw" type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} className="border-0 bg-transparent p-0 text-lg outline-none" />
      </Field>
      {err && <p role="alert" className="m-0 text-sm font-semibold text-[#B3261E]">{err}</p>}
      <PrimaryButton type="submit" className="mt-0" disabled={!pw}>Sign in</PrimaryButton>
    </form>
  );
}

export function CopyJson({ json }: { json: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="min-h-[44px] rounded-full bg-chip px-3.5 text-sm font-bold hover:bg-tint" onClick={async () => {
      try { await navigator.clipboard.writeText(json); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ }
    }}>{done ? "Copied" : "Copy JSON"}</button>
  );
}

type Preview = { count: number; codes: string[] };

export function Moderator() {
  const [code, setCode] = useState("P08");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const check = async () => {
    setMsg("");
    const r = await fetch("/api/admin/delete-test").then((x) => x.json()).catch(() => null);
    if (!r?.ok) return setMsg("Could not list test sessions.");
    if (!r.count) return setMsg("No test sessions.");
    setPreview({ count: r.count, codes: r.codes });
  };
  const del = async () => {
    const r = await fetch("/api/admin/delete-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expect: preview?.count }) }).then((x) => x.json()).catch(() => null);
    setPreview(null);
    setMsg(r?.ok ? `Deleted ${r.deleted} test session(s).` : r?.reason === "changed" ? "The list changed. Check again." : "Delete failed.");
  };
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/?p=${encodeURIComponent(code.trim())}`;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-line p-4">
      <h3 className="m-0 text-base font-extrabold">Moderator</h3>
      <Field id="mod-code" label="Participant name">
        <input id="mod-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} className="border-0 bg-transparent p-0 text-lg outline-none" />
      </Field>
      <textarea readOnly aria-label="Test link" rows={2} value={link} className={`${textareaCls} rounded-lg bg-chip p-2 text-sm`} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-[44px] rounded-full bg-chip px-3.5 text-sm font-bold hover:bg-tint" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        {!preview && <button type="button" className="min-h-[44px] rounded-full border-2 border-[#B3261E] bg-white px-3.5 text-sm font-bold text-[#B3261E]" onClick={check}>Delete TEST sessions...</button>}
        {msg && <span role="status" className="text-sm font-semibold text-muted">{msg}</span>}
      </div>
      {preview && (
        <div className="flex flex-col gap-2 rounded-xl bg-[#FBE9E7] p-3 text-sm">
          <span className="font-bold text-[#B3261E]">Permanently delete {preview.count} session(s)?</span>
          <span className="text-muted">{preview.codes.join(", ")}</span>
          <div className="flex gap-2">
            <button type="button" onClick={del} className="min-h-[44px] rounded-full bg-[#B3261E] px-4 font-bold text-white">Delete</button>
            <button type="button" onClick={() => setPreview(null)} className="min-h-[44px] rounded-full bg-white px-4 font-bold">Cancel</button>
          </div>
        </div>
      )}
      <p className="m-0 text-[13px] text-muted">Test codes start with TEST in capitals and a space or dash, e.g. &quot;TEST Waleed&quot;.</p>
    </div>
  );
}

export type ModelRow = { id: string; status: "ok" | "untested" | "cooling" | "gone"; note: string };

export function Models({ rows, preferred }: { rows: ModelRow[]; preferred: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const post = async (body: object, label: string) => {
    setBusy(label); setMsg("");
    const r = await fetch("/api/admin/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) setMsg("Request failed.");
    else if (r.results) setMsg(`${r.results.filter((x: { ok: boolean }) => x.ok).length} of ${r.results.length} models answered.`);
    else if (typeof r.count === "number") setMsg(`Found ${r.count} models.`);
    else if (typeof r.cleared === "number") setMsg(`Cleared ${r.cleared} cached move set(s).`);
    router.refresh();
  };
  const pill = { ok: "bg-ok-bg text-ok", untested: "bg-chip text-muted", cooling: "bg-warn-bg text-warn", gone: "bg-[#FBE9E7] text-[#B3261E]" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold text-blue-dark">Try first
          <select value={preferred ?? ""} disabled={!!busy} onChange={(e) => post({ action: "prefer", id: e.target.value || null }, "prefer")} className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink">
            <option value="">Automatic order</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
          </select>
        </label>
        <button type="button" disabled={!!busy} onClick={() => post({ action: "test" }, "test")} className="min-h-[44px] rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-blue-dark disabled:opacity-50">{busy === "test" ? "Testing..." : "Test all"}</button>
        <button type="button" disabled={!!busy} onClick={() => post({ action: "refresh" }, "refresh")} className="min-h-[44px] rounded-full bg-chip px-4 text-sm font-bold hover:bg-tint disabled:opacity-50">{busy === "refresh" ? "Looking..." : "Re-discover models"}</button>
        <button type="button" disabled={!!busy} onClick={() => post({ action: "clear-cache" }, "clear")} title="Cached move sets are replayed for identical inputs; clear after a bad or off-topic set." className="min-h-[44px] rounded-full bg-chip px-4 text-sm font-bold hover:bg-tint disabled:opacity-50">{busy === "clear" ? "Clearing..." : "Clear cached moves"}</button>
        {msg && <span role="status" className="text-sm font-semibold text-muted">{msg}</span>}
      </div>
      {rows.length === 0 ? <p className="m-0 text-[#B3261E]">No models available. Set GEMINI_API_KEY (or GROQ_API_KEY / OPENROUTER_API_KEY), or start Ollama.</p> : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line2 px-3 py-2 text-sm">
              <span className="w-5 text-right font-bold tabular-nums text-muted">{i + 1}</span>
              <b className="min-w-[260px]">{r.id}{r.id === preferred ? " (first)" : ""}</b>
              <span className={`rounded-full px-[9px] py-[3px] text-xs font-bold ${pill[r.status]}`}>{r.status}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted" title={r.note}>{r.note}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
