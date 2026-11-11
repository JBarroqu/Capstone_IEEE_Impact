import { useEffect, useState } from "react";
import { Button, ErrorNote, PageTitle, Panel, PanelTitle, Skeleton } from "@/components/ui";
import { ApiError, get, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ProfessionalState } from "@/lib/types";
import { BackgroundFields, BasicsFields, ContributionsFields, fromState, SkillsFields, toPayload, type Draft } from "./ProfileForm";

export default function ProfilePage() {
  const { refreshMe } = useAuth();
  const [d, setD] = useState<Draft | null>(null);
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<{ profile: ProfessionalState }>("/api/v1/profile").then((r) => { setD(fromState(r.profile)); setVersion(r.profile.version); }); }, []);
  if (!d) return <div className="flex flex-col gap-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x!, ...p })); setSaved(false); };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await put<{ profile: ProfessionalState }>("/api/v1/profile", toPayload(d, true));
      setD(fromState(r.profile)); setVersion(r.profile.version); setSaved(true); await refreshMe();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save."); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageTitle sub="Your professional state. Your next moves use it; changes apply from the next set of options.">Profile</PageTitle>
      <Panel><PanelTitle>About you</PanelTitle><BasicsFields d={d} set={set} /></Panel>
      <Panel><PanelTitle>Background and target career</PanelTitle><BackgroundFields d={d} set={set} /></Panel>
      <Panel><PanelTitle>Skills, strengths and growth areas</PanelTitle><SkillsFields d={d} set={set} /></Panel>
      <Panel><PanelTitle>Featured contributions</PanelTitle><ContributionsFields d={d} set={set} /></Panel>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex items-center gap-4">
        <Button busy={busy} onClick={save}>Save profile</Button>
        {saved && <span className="text-sm font-semibold text-growth">Saved (version {version}).</span>}
      </div>
    </div>
  );
}
