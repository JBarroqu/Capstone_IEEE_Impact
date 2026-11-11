/* Admin (ADMIN_PASSWORD, D-47) in the same design: the policies page (D-52) lists every switchable decision with its
   owner and lets you change it live; plus model controls, analytics, exports and endorsements (D-24). */
import { useCallback, useEffect, useState } from "react";
import { Button, Chip, ChipRow, ErrorNote, Field, Input, PageTitle, Panel, PanelTitle, Select, Skeleton, Tag } from "@/components/ui";
import { API_BASE } from "@/lib/api";

type Policy = { key: string; decision: string; module: string; owner: string; kind: string; description: string; choices: (string | number)[]; allowedItems: string[]; min: number | null; max: number | null; default: unknown; value: unknown; source: string; adminEditable: boolean };

async function adminFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/admin${path}`, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status });
  return body as T;
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-[460px]">
      <Panel>
        <h1 className="mb-4 text-2xl font-bold tracking-[-0.72px] text-navy">Admin</h1>
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          try { await adminFetch("/login", { method: "POST", body: JSON.stringify({ password: pw }) }); onDone(); } catch (x) { setError((x as Error).message); }
        }}>
          <Field label="Admin password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit">Sign in</Button>
        </form>
      </Panel>
    </div>
  );
}

function PolicyControl({ p, onSave }: { p: Policy; onSave: (v: unknown) => void }) {
  if (p.kind === "bool") return <ChipRow><Chip on={p.value === true} onClick={() => onSave(true)}>On</Chip><Chip on={p.value === false} onClick={() => onSave(false)}>Off</Chip></ChipRow>;
  if (p.kind === "choice") return <Select value={String(p.value)} onChange={(v) => onSave(v)} options={p.choices.map((c) => ({ value: String(c), label: String(c) }))} />;
  if (p.kind === "list") {
    const cur = (p.value as string[]) ?? [];
    return <ChipRow>{p.allowedItems.map((i) => <Chip key={i} on={cur.includes(i)} onClick={() => onSave(cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i])}>{i}</Chip>)}</ChipRow>;
  }
  return <Input type="number" min={p.min ?? undefined} max={p.max ?? undefined} defaultValue={String(p.value)} onBlur={(e) => onSave(Number(e.target.value))} className="max-w-[140px]" />;
}

function Policies() {
  const [list, setList] = useState<Policy[] | null>(null);
  const [editable, setEditable] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => adminFetch<{ policies: Policy[]; editable: boolean }>("/policies").then((r) => { setList(r.policies); setEditable(r.editable); }), []);
  useEffect(() => { void load(); }, [load]);
  const save = async (key: string, value: unknown) => {
    setMsg(null);
    try { await adminFetch("/policies", { method: "PUT", body: JSON.stringify({ key, value }) }); await load(); setMsg(`${key} saved. It applies from now on; past points keep their rules.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  if (!list) return <Skeleton className="h-64 w-full" />;
  const modules = [...new Set(list.map((p) => p.module))];
  return (
    <Panel>
      <PanelTitle>Policies</PanelTitle>
      <p className="mb-4 text-sm text-secondary">Every switchable decision (docs/MODULE_OWNER_DECISIONS.md). Source shows where the current value comes from: default, env or admin.</p>
      {!editable && <ErrorNote>Editing is switched off (POLICY_ADMIN_EDIT=false).</ErrorNote>}
      {msg && <p className="mb-3 text-sm font-semibold text-primary">{msg}</p>}
      {modules.map((mod) => (
        <div key={mod} className="mb-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-heading">{mod} · {list.find((p) => p.module === mod)?.owner}</h3>
          <ul className="flex flex-col">
            {list.filter((p) => p.module === mod).map((p) => (
              <li key={p.key} className="grid gap-2 border-b border-black px-2.5 py-3 md:grid-cols-[1fr_260px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><code className="text-sm font-semibold text-navy">{p.key}</code><Tag>{p.decision}</Tag>
                    <Tag tone={p.source === "admin" ? "pro" : p.source === "env" ? "impact" : "neutral"}>{p.source}</Tag></div>
                  <p className="mt-1 text-sm text-secondary">{p.description}</p>
                </div>
                <div className="flex flex-col gap-1">
                  {editable && p.adminEditable ? <PolicyControl p={p} onSave={(v) => save(p.key, v)} /> : <span className="text-sm">{JSON.stringify(p.value)}</span>}
                  {p.source === "admin" && <Button kind="text" className="self-start text-xs" onClick={() => save(p.key, null)}>Reset to {JSON.stringify(p.default)}</Button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

function Models() {
  const [rows, setRows] = useState<{ id: string; status: string; note: string }[] | null>(null);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => adminFetch<{ models: { rows: { id: string; status: string; note: string }[]; preferred: string | null } }>("/dashboard").then((d) => { setRows(d.models.rows); setPreferred(d.models.preferred); });
  useEffect(() => { void load(); }, []);
  const act = async (body: object) => { setBusy(true); try { await adminFetch("/models", { method: "POST", body: JSON.stringify(body) }); await load(); } finally { setBusy(false); } };
  return (
    <Panel>
      <PanelTitle right={<span className="flex gap-2"><Button kind="secondary" busy={busy} onClick={() => act({ action: "test" })}>Test all</Button><Button kind="text" onClick={() => act({ action: "refresh" })}>Refresh list</Button></span>}>Models</PanelTitle>
      {!rows ? <Skeleton className="h-24 w-full" /> : (
        <ul>{rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-black px-2.5 py-2 text-sm">
            <code className="font-semibold">{r.id}</code><Tag tone={r.status === "ok" ? "growth" : r.status === "untested" ? "neutral" : "impact"}>{r.status}</Tag>
            <span className="flex-1 text-secondary">{r.note}</span>
            <Button kind="text" className="text-xs" onClick={() => act({ action: "prefer", id: preferred === r.id ? null : r.id })}>{preferred === r.id ? "Tried first (clear)" : "Try first"}</Button>
          </li>
        ))}</ul>
      )}
    </Panel>
  );
}

function Analytics() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { adminFetch("/dashboard").then(setD); }, []);
  if (!d) return <Skeleton className="h-40 w-full" />;
  return (
    <Panel>
      <PanelTitle>Analytics</PanelTitle>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Tag>{d.eventCount} events</Tag><Tag>{d.wishCount} wishes</Tag><Tag>{d.sessions.length} users</Tag><Tag tone="impact">{d.failedLoads} failed option loads</Tag>
      </div>
      <h3 className="mb-2 text-sm font-bold text-heading">Funnel</h3>
      <ul className="mb-4 grid gap-1 text-sm sm:grid-cols-2">{(d.funnel as { label: string; n: number }[]).map((f) => <li key={f.label} className="flex justify-between rounded bg-white px-3 py-1.5"><span>{f.label}</span><strong>{f.n}</strong></li>)}</ul>
      <h3 className="mb-2 text-sm font-bold text-heading">Reject reasons</h3>
      <p className="mb-4 text-sm text-secondary">
        {Object.entries((d.rejectReasons ?? {}) as Record<string, Record<string, number>>)
          .flatMap(([step, rs]) => Object.entries(rs).map(([r, n]) => `move ${step}, ${r}: ${n}`)).join(" · ") || "none yet"}
      </p>
      <h3 className="mb-2 text-sm font-bold text-heading">Exports</h3>
      <div className="flex flex-wrap gap-2">{["events", "choices", "feedback", "moves"].map((k) => <a key={k} href={`${API_BASE}/api/admin/export/${k}`} className="rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-chip-active">{k}.csv</a>)}</div>
    </Panel>
  );
}

function Endorse() {
  const [handle, setHandle] = useState("");
  const [skill, setSkill] = useState("");
  const [tier, setTier] = useState("Verified");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Panel>
      <PanelTitle>Endorsements</PanelTitle>
      <p className="mb-3 text-sm text-secondary">Verified needs an endorsement (D-24). A Mentor endorsement makes someone a senior reviewer (open question Q1).</p>
      <div className="grid gap-3 md:grid-cols-4">
        <Input placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <Input placeholder="skill id, e.g. sql" value={skill} onChange={(e) => setSkill(e.target.value)} />
        <Select value={tier} onChange={setTier} options={[{ value: "Verified", label: "Verified" }, { value: "Mentor", label: "Mentor" }]} />
        <Button onClick={async () => {
          try { await adminFetch("/endorsements", { method: "POST", body: JSON.stringify({ userHandle: handle, skillId: skill || "any", tier }) }); setMsg("Saved."); } catch (e) { setMsg((e as Error).message); }
        }}>Endorse</Button>
      </div>
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
    </Panel>
  );
}

export default function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const check = () => adminFetch<{ admin: boolean }>("/session").then((r) => setAdmin(r.admin)).catch(() => setAdmin(false));
  useEffect(() => { void check(); }, []);
  if (admin === null) return <Skeleton className="h-40 w-full" />;
  if (!admin) return <Login onDone={check} />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between"><PageTitle sub="Separate from user accounts.">Admin</PageTitle>
        <Button kind="text" onClick={async () => { await adminFetch("/logout", { method: "POST" }); setAdmin(false); }}>Sign out</Button></div>
      <Policies />
      <Models />
      <Analytics />
      <Endorse />
    </div>
  );
}
