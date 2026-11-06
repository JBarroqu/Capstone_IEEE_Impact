import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, ErrorNote, PageTitle, Panel, Skeleton } from "@/components/ui";
import { ApiError, get } from "@/lib/api";
import type { Evidence } from "@/lib/types";
import { EvidenceCard } from "./EvidenceCard";

export default function EvidencePage() {
  const { id = "" } = useParams();
  const [e, setE] = useState<Evidence | null>(null);
  const [role, setRole] = useState<string>("owner");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<{ evidence: Evidence; role: string }>(`/api/v1/evidence/${id}`).then((r) => { setE(r.evidence); setRole(r.role); })
      .catch((x) => setError(x instanceof ApiError ? x.message : "Couldn't load."));
  }, [id]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!e) return <Skeleton className="h-64 w-full" />;
  const openFile = async () => {
    const r = await get<{ url: string }>(`/api/v1/evidence/${id}/file-url`);
    window.open(r.url, "_blank", "noopener");
  };
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4">
      <Link to={role === "owner" ? "/growth" : "/buddies"} className="text-sm font-semibold text-primary hover:opacity-60">Back</Link>
      <PageTitle sub={`${e.activityType} · ${e.difficultyFinal ?? e.difficulty} · ${e.skillId.replace(/_/g, " ")}`}>Evidence</PageTitle>
      <Panel>
        <EvidenceCard e={e} link={false} />
        {e.hasFile && <Button kind="secondary" className="mt-4" onClick={openFile}>Open the file</Button>}
      </Panel>
    </div>
  );
}
