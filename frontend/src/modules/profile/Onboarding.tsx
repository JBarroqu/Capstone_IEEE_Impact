/* Onboarding (D-01): a guided stepper, with an optional resume import that only fills a draft (D-42, D-43). */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, ErrorNote, Panel, SubPanel } from "@/components/ui";
import { ApiError, get, post, put, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import type { ProfessionalState } from "@/lib/types";
import { BackgroundFields, BasicsFields, ContributionsFields, emptyDraft, fromState, mergeImport, SkillsFields, toPayload, type Draft } from "./ProfileForm";

const STEPS = ["About you", "Background", "Skills and goals", "Your work", "Review"];

function ResumeImport({ onDraft }: { onDraft: (d: Partial<Draft>, id: string) => void }) {
  const { policy } = useConfig();
  const [state, setState] = useState<"idle" | "reading" | "done" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (policy("PROFILE_IMPORT") === "off") return null;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setState("reading"); setError(null);
    const form = new FormData();
    form.append("file", f);
    try {
      const { importId } = await upload<{ importId: string }>("/api/v1/profile/import", form);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const r = await get<{ status: string; draft: Partial<Draft> | null; error: string | null }>(`/api/v1/profile/import/${importId}`);
        if (r.status === "parsed" && r.draft) { onDraft(r.draft, importId); setState("done"); return; }
        if (r.status === "failed") { setError(r.error); setState("failed"); return; }
      }
      setError("Reading took too long. Fill in the form instead."); setState("failed");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed."); setState("failed");
    }
  };
  return (
    <SubPanel className="mb-6">
      <h2 className="mb-1 text-base font-bold text-primary">Start from your resume</h2>
      <p className="mb-3 text-sm text-secondary">
        Optional. Upload a PDF or Word file (up to {policy("RESUME_MAX_MB") ?? 5} MB) and we'll fill in a draft you can edit.
        Nothing is saved until you finish. The file is deleted after it's read.
      </p>
      <div className="flex flex-wrap items-center gap-3"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" className="hidden" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => void pick(e.target.files?.[0])} />
        <Button kind="secondary" busy={state === "reading"} onClick={() => input.current?.click()}>
          {state === "done" ? "Upload another" : "Choose a file"}
        </Button>
        {state === "reading" && <span className="text-sm text-secondary">Reading your resume...</span>}
        {state === "done" && <span className="text-sm font-semibold text-growth">Draft filled in. Check each step.</span>}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </SubPanel>
  );
}

export default function Onboarding() {
  const nav = useNavigate();
  const { me, refreshMe } = useAuth();
  const { catalog } = useConfig();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(emptyDraft());
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    get<{ profile: ProfessionalState }>("/api/v1/profile").then((r) => setD((x) => ({ ...fromState(r.profile), handle: r.profile.handle ?? x.handle })))
      .catch(() => {});
  }, []);
  useEffect(() => { if (me?.onboarded) nav("/", { replace: true }); }, [me, nav]);

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await put("/api/v1/profile", toPayload(d, true));
      if (importId) await post(`/api/v1/profile/import/${importId}/applied`).catch(() => {});
      await refreshMe();
      nav("/", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally { setBusy(false); }
  };
  const career = catalog?.careers.find((c) => c.id === d.targetCareerId);

  return (
    <div className="mx-auto max-w-[820px]">
      <h1 className="mb-1 text-2xl font-bold tracking-[-0.72px] text-navy">Where are you now?</h1>
      <p className="mb-6 text-[15px] text-secondary">Your professional state shapes every move you get. It takes about three minutes.</p>
      <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-1">
            <span className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-white"}`} />
            <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-navy" : "text-secondary"}`}>{s}</span>
          </li>
        ))}
      </ol>
      <Panel>
        {step === 0 && <><ResumeImport onDraft={(imp, id) => { setD((x) => mergeImport(x, imp)); setImportId(id); }} /><BasicsFields d={d} set={set} /></>}
        {step === 1 && <BackgroundFields d={d} set={set} />}
        {step === 2 && <SkillsFields d={d} set={set} />}
        {step === 3 && <ContributionsFields d={d} set={set} />}
        {step === 4 && (
          <div className="flex flex-col gap-3 text-[15px]">
            <p><strong>{d.displayName || "No name yet"}</strong>{d.handle ? ` · @${d.handle}` : ""}</p>
            {d.headline && <p className="text-secondary">{d.headline}</p>}
            <p>Target career: <strong>{career?.name ?? "not chosen"}</strong></p>
            <p>Skills: {d.skills.join(", ") || "none yet"}</p>
            <p>Strengths: {d.strengths.join(", ") || "none yet"}</p>
            <p>Growth areas: {d.growthAreas.join(", ") || "none yet"}</p>
            <p>Contributions: {d.featuredContributions.filter((c) => c.title.trim()).length}</p>
            <p className="text-xs text-secondary">You can change all of this later on your Profile page.</p>
          </div>
        )}
        {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
        <div className="mt-6 flex justify-between gap-3">
          <Button kind="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            : <Button busy={busy} onClick={finish}>Finish and go to Home</Button>}
        </div>
      </Panel>
    </div>
  );
}
