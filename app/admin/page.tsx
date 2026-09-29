import { Fragment } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { loadData, parseFilters, type Filters } from "@/lib/admin-data";
import { classifierAccuracy, feedback, funnel, groupBy, keyNumbers, leaderboard, rejectReasons } from "@/lib/analytics";
import { AdminLogin, CopyJson, Moderator } from "@/components/admin/client";
import { Tag } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wish Engine admin" };

type SP = Record<string, string | undefined>;

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="m-0 mb-3 text-xl font-extrabold">{children}</h2>;
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col"><H2>{title}</H2>{children}</section>
);
const Th = ({ children }: { children?: React.ReactNode }) => <th scope="col" className="whitespace-nowrap border-b-2 border-line px-3 py-2 text-left text-[13px] font-bold text-blue-dark">{children}</th>;
const Td = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => <td className={`border-b border-line2 px-3 py-2 align-top text-sm ${right ? "text-right tabular-nums" : ""}`}>{children}</td>;
const Table = ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto rounded-[14px] border border-line2"><table className="w-full border-collapse">{children}</table></div>;
const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const dash = (v: unknown) => (v == null || v === "" ? "–" : String(v));
const split = (o: Record<string, number> | undefined) => (o && Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(" · ") : "–");

function qs(f: Filters, extra: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  return p.toString();
}

export default async function Admin({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isAdmin())) return <AdminLogin />;
  const sp = await searchParams;
  const f = parseFilters(sp);
  const sort = sp.sort ?? "pickRate";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  let data;
  try { data = await loadData(f); } catch (e) {
    return <div className="mx-auto max-w-[600px] p-5"><h1 className="text-2xl font-extrabold">Database error</h1><p className="text-muted">Check DATABASE_URL and run <code>npm run db:push</code>.</p></div>;
  }
  const { events, wishes, meta, generated } = data;
  const fn = funnel(events);
  const max = Math.max(1, fn[0].n);
  const lb = leaderboard(events, meta);
  const rr = rejectReasons(events);
  const ca = classifierAccuracy(events);
  const fb = feedback(events, wishes);
  const byProvider = groupBy(events, (e) => e.provider ?? "unknown", keyNumbers);
  const exportQs = qs(f, {});
  const sortLink = (col: string) => `/admin?${qs(f, { sort: col, dir: sort === col && dir === "desc" ? "asc" : "desc" })}`;

  const sorted = [...lb].sort((a, b) => {
    const x = (a as any)[sort], y = (b as any)[sort];
    const c = typeof x === "string" ? String(x).localeCompare(String(y)) : (x ?? -1) - (y ?? -1);
    return dir === "asc" ? c : -c;
  });
  const steps = [...new Set(sorted.map((r) => r.step ?? 0))].sort();
  const cols: [string, string][] = [["title", "Move"], ["source", "Source"], ["focus", "Focus"], ["cost", "Cost"], ["shown", "Shown"], ["picked", "Picked"], ["pickRate", "Pick rate"], ["rejected", "Rejected"], ["medianDecisionMs", "Median ms"], ["pickRatePos1", "Pos 1"], ["pickRatePos2", "Pos 2"], ["pickRatePos3", "Pos 3"]];

  const genRows = lb.filter((r) => r.source === "generated");
  const genById = new Map(generated.map((g) => [g.id, g]));

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <span className="text-[17px] font-extrabold text-blue">Wish Engine admin</span>
        <span className="text-[13px] text-muted">{events.length} events · {wishes.length} wishes</span>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[14px] bg-tint p-4" aria-label="Filters">
        {([["from", "From", "date"], ["to", "To", "date"], ["participant", "Participant name", "text"]] as const).map(([k, l, t]) => (
          <label key={k} className="flex flex-col gap-1 text-[13px] font-bold text-blue-dark">{l}
            <input name={k} type={t} defaultValue={f[k]} className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink" />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[13px] font-bold text-blue-dark">Provider
          <select name="provider" defaultValue={f.provider ?? ""} className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink">
            <option value="">All</option><option value="static">static</option><option value="ollama">ollama</option><option value="gemini">gemini</option>
          </select>
        </label>
        <button className="min-h-[44px] rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-blue-dark">Apply</button>
        <a href="/admin" className="flex min-h-[44px] items-center text-sm font-bold text-blue underline">Reset</a>
      </form>

      <Section title="Export CSV">
        <div className="flex flex-wrap gap-2">
          {["events", "choices", "feedback", "moves"].map((k) => (
            <a key={k} href={`/api/admin/export/${k}?${exportQs}`} className="flex min-h-[44px] items-center rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-blue-dark">{k}.csv</a>
          ))}
        </div>
      </Section>

      <Section title="Funnel">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {fn.map((s) => (
            <li key={s.label} className="grid grid-cols-[130px_1fr_56px] items-center gap-3 text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="h-5 rounded bg-chip"><span className="block h-5 rounded bg-blue" style={{ width: `${(s.n / max) * 100}%` }} /></span>
              <span className="text-right font-bold tabular-nums">{s.n}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Provider comparison">
        {Object.keys(byProvider).length === 0 ? <p className="m-0 text-muted">No data yet.</p> : (
          <Table>
            <thead><tr><Th>Provider</Th><Th>Sessions</Th><Th>Rated</Th><Th>Avg rating</Th><Th>Would do this week</Th><Th>Options useful</Th><Th>Median latency ms</Th><Th>LLM failed</Th><Th>Static fallback</Th><Th>Reroll rate</Th><Th>Classifier kept</Th></tr></thead>
            <tbody>
              {Object.entries(byProvider).map(([k, v]) => (
                <tr key={k}><Td><b>{k}</b></Td><Td right>{v.sessions}</Td><Td right>{v.completedRated}</Td><Td right>{dash(v.avgRating)}</Td><Td>{split(v.wouldDoThisWeek)}</Td><Td>{split(v.optionsUseful)}</Td><Td right>{dash(v.medianLatencyMs)}</Td><Td right>{v.failedRate == null ? "–" : `${v.failedRate}%`}</Td><Td right>{v.fallbackRate == null ? "–" : `${v.fallbackRate}%`}</Td><Td right>{v.rerollRate == null ? "–" : `${v.rerollRate}%`}</Td><Td right>{v.classifierAccuracyPct == null ? "–" : `${v.classifierAccuracyPct}%`}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-[13px] text-muted">Rows come from each event&apos;s provider. LLM failed = option requests where the LLM never produced valid moves (student saw a retry prompt). Static fallback only happens if LLM_FALLBACK=static.</p>
      </Section>

      <Section title="Move leaderboard">
        {sorted.length === 0 ? <p className="m-0 text-muted">No data yet.</p> : (
          <Table>
            <thead><tr>{cols.map(([c, l]) => <Th key={c}><a href={sortLink(c)} className="text-blue-dark underline">{l}{sort === c ? (dir === "asc" ? " ↑" : " ↓") : ""}</a></Th>)}</tr></thead>
            <tbody>
              {steps.map((st) => (
                <Fragment key={st}>
                  <tr key={`h${st}`}><td colSpan={cols.length} className="bg-tint px-3 py-1.5 text-[13px] font-extrabold text-blue-dark">{st ? `Move ${st}` : "Unknown step"}</td></tr>
                  {sorted.filter((r) => (r.step ?? 0) === st).map((r) => (
                    <tr key={r.id}>
                      <Td>{r.title}<div className="text-xs text-muted">{r.id}</div></Td><Td>{r.source}</Td><Td>{r.focus}</Td><Td>{r.cost ? <Tag kind={r.cost as "free" | "paid"}>{r.cost}</Tag> : "–"}</Td>
                      <Td right>{r.shown}</Td><Td right>{r.picked}</Td><Td right><b>{pct(r.pickRate)}</b></Td><Td right>{r.rejected}</Td><Td right>{dash(r.medianDecisionMs)}</Td>
                      <Td right>{pct(r.pickRatePos1)}</Td><Td right>{pct(r.pickRatePos2)}</Td><Td right>{pct(r.pickRatePos3)}</Td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Reject reasons">
        {Object.keys(rr).length === 0 ? <p className="m-0 text-muted">None yet.</p> : (
          <Table>
            <thead><tr><Th>Move step</Th><Th>Reasons</Th></tr></thead>
            <tbody>{Object.entries(rr).sort().map(([s, r]) => <tr key={s}><Td>Move {s}</Td><Td>{split(r)}</Td></tr>)}</tbody>
          </Table>
        )}
      </Section>

      <Section title="Classifier accuracy">
        <p className="m-0 text-base">{ca.pct == null ? "No data yet." : <><b className="text-2xl">{ca.pct}%</b> of wishes kept the guessed focus and area ({ca.kept} of {ca.total}).</>}</p>
      </Section>

      <Section title="Feedback">
        <Table>
          <tbody>
            <tr><Td><b>Average path rating</b></Td><Td>{dash(fb.avgRating)} ({fb.ratings} rated)</Td></tr>
            <tr><Td><b>Would do move 1 this week</b></Td><Td>{split(fb.wouldDoThisWeek)}</Td></tr>
            <tr><Td><b>Options useful, by move</b></Td><Td>{Object.keys(fb.optionsUseful).length ? Object.entries(fb.optionsUseful).sort().map(([s, o]) => <div key={s}>Move {s}: {split(o)}</div>) : "–"}</Td></tr>
            <tr><Td><b>Willingness to pay</b></Td><Td>{Object.keys(fb.paidWillingness).length ? Object.entries(fb.paidWillingness).map(([id, o]) => <div key={id}>{meta.get(id)?.title ?? id}: {split(o)}</div>) : "–"}</Td></tr>
          </tbody>
        </Table>
        <h3 className="mb-2 mt-5 text-base font-extrabold">Open feedback</h3>
        {fb.openText.length === 0 ? <p className="m-0 text-muted">None yet.</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {fb.openText.map((o, i) => <li key={i} className="rounded-xl bg-chip p-3 text-sm"><div>{o.text}</div><div className="mt-1 text-xs text-muted">Wish: {o.wish || "–"}</div></li>)}
          </ul>
        )}
      </Section>

      <Section title="Generated moves">
        {genRows.length === 0 ? <p className="m-0 text-muted">None yet.</p> : (
          <Table>
            <thead><tr><Th>Move</Th><Th>Step</Th><Th>Shown</Th><Th>Picked</Th><Th>Pick rate</Th><Th /></tr></thead>
            <tbody>
              {genRows.map((r) => {
                const g = genById.get(r.id);
                const json = JSON.stringify({ ...(g?.move as object), id: r.id }, null, 2);
                return <tr key={r.id}><Td>{r.title}<div className="text-xs text-muted">{r.id}</div></Td><Td right>{r.step}</Td><Td right>{r.shown}</Td><Td right>{r.picked}</Td><Td right><b>{pct(r.pickRate)}</b></Td><Td><CopyJson json={json} /></Td></tr>;
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <Moderator />
    </div>
  );
}
