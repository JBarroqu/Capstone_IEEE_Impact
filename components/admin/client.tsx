"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, PrimaryButton, textareaCls } from "../ui";

export function AdminLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) router.refresh(); else setErr(true);
  };
  return (
    <form onSubmit={submit} className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-4 px-5">
      <span className="text-[17px] font-extrabold text-blue">Wish Engine admin</span>
      <Field id="pw" label="Password">
        <input id="pw" type="password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} className="border-0 bg-transparent p-0 text-lg outline-none" />
      </Field>
      {err && <p role="alert" className="m-0 text-sm font-semibold text-[#B3261E]">Wrong password.</p>}
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

export function Moderator() {
  const [code, setCode] = useState("P08");
  const [msg, setMsg] = useState("");
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/?p=${encodeURIComponent(code.trim())}`;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-line p-4">
      <h3 className="m-0 text-base font-extrabold">Moderator</h3>
      <Field id="mod-code" label="Participant code">
        <input id="mod-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} className="border-0 bg-transparent p-0 text-lg outline-none" />
      </Field>
      <textarea readOnly aria-label="Test link" rows={2} value={link} className={`${textareaCls} rounded-lg bg-chip p-2 text-sm`} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-[44px] rounded-full bg-chip px-3.5 text-sm font-bold hover:bg-tint" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        <button type="button" className="min-h-[44px] rounded-full border-2 border-[#B3261E] bg-white px-3.5 text-sm font-bold text-[#B3261E]" onClick={async () => {
          if (!confirm("Delete all sessions whose participant code starts with TEST?")) return;
          const r = await fetch("/api/admin/delete-test", { method: "POST" }).then((x) => x.json()).catch(() => null);
          setMsg(r?.ok ? `Deleted ${r.deleted} test session(s).` : "Delete failed.");
        }}>Delete TEST sessions</button>
        {msg && <span role="status" className="text-sm font-semibold text-muted">{msg}</span>}
      </div>
    </div>
  );
}
