/* Module 3: submit evidence for a selected move. Skill, activity type and difficulty come from the move (D-11). With
   MOVE_TAGS_SOURCE=user the form shows them as choices, starting from the move's tags (Growth-Validation original). */
import { useRef, useState } from "react";
import { Button, Chip, ChipRow, ErrorNote, Field, Input, Select, TextArea } from "@/components/ui";
import { ApiError, upload } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { track } from "@/lib/track";
import type { Evidence } from "@/lib/types";

type Tags = { skillId: string; activityType: string; difficulty: string };
const ACTIVITY_TYPES = ["explore", "create", "test", "share", "connect", "enable"];
const DIFFICULTIES = ["easy", "moderate", "hard"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What happens after submitting, worded for VALIDATION_MODE (D-13). */
function afterSubmit(mode: string | undefined) {
  if (mode === "ai_only") return "It's scored right away.";
  if (mode === "buddy_required") return "The rubric gives written feedback right away; points come once your reviewer rates it.";
  return "It's scored right away, then your reviewer confirms it.";
}

export function EvidenceForm({ selectedMoveId, revisionOf, tags, onSubmitted }: { selectedMoveId: string; revisionOf?: string; tags?: Tags; onSubmitted: (e: Evidence) => void }) {
  const { policy, catalog } = useConfig();
  const userTags = policy("MOVE_TAGS_SOURCE") === "user";
  const [t, setT] = useState<Tags>(tags ?? { skillId: "", activityType: "create", difficulty: "moderate" });
  const careers = catalog?.careers ?? [];
  const skills = (careers.find((c) => c.skills.some((s) => s.id === t.skillId)) ?? null)?.skills ?? careers.flatMap((c) => c.skills);
  const skillOptions = [...(t.skillId && !skills.some((s) => s.id === t.skillId) ? [{ value: t.skillId, label: t.skillId.replace(/_/g, " ") }] : []),
    ...skills.map((s) => ({ value: s.id, label: s.name }))];
  const [kind, setKind] = useState<"link" | "file" | "text">("link");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ready = summary.trim() && (kind !== "link" || /^https?:\/\//.test(url)) && (kind !== "file" || file);

  const submit = async () => {
    setBusy(true); setError(null);
    const f = new FormData();
    f.append("selectedMoveId", selectedMoveId);
    f.append("artifactType", kind);
    f.append("summary", summary.trim());
    if (kind === "link") f.append("url", url.trim());
    if (kind === "file" && file) f.append("file", file);
    if (revisionOf) f.append("revisionOf", revisionOf);
    if (userTags) { f.append("skillId", t.skillId); f.append("activityType", t.activityType); f.append("difficulty", t.difficulty); }
    try {
      const r = await upload<{ evidence: Evidence }>("/api/v1/evidence", f);
      track("evidence_submitted", { artifact_type: kind, revision: !!revisionOf });
      onSubmitted(r.evidence);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't submit. Try again."); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-white p-5">
      <div>
        <h3 className="text-base font-bold text-navy">{revisionOf ? "Submit a revision" : "Show what you did"}</h3>
        <p className="text-sm text-secondary">
          {afterSubmit(policy("VALIDATION_MODE"))}
        </p>
      </div>
      <ChipRow label="Evidence type">
        <Chip on={kind === "link"} onClick={() => setKind("link")}>Link</Chip>
        <Chip on={kind === "file"} onClick={() => setKind("file")}>File</Chip>
        <Chip on={kind === "text"} onClick={() => setKind("text")}>Write it up</Chip>
      </ChipRow>
      {kind === "link" && <Field label="Link" hint="A repo, doc, post, or anything public."><Input type="url" value={url} placeholder="https://github.com/..." onChange={(e) => setUrl(e.target.value)} /></Field>}
      {kind === "file" && (
        <div className="flex items-center gap-3">
          <input ref={input} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button kind="secondary" onClick={() => input.current?.click()}>{file ? "Change file" : "Choose a file"}</Button>
          <span className="truncate text-sm text-secondary">{file ? file.name : "PDF, Word, text or image, up to 10 MB"}</span>
        </div>
      )}
      {userTags && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Skill"><Select value={t.skillId} onChange={(v) => setT({ ...t, skillId: v })} options={skillOptions} /></Field>
          <Field label="Activity type"><Select value={t.activityType} onChange={(v) => setT({ ...t, activityType: v })} options={ACTIVITY_TYPES.map((a) => ({ value: a, label: cap(a) }))} /></Field>
          <Field label="Difficulty"><Select value={t.difficulty} onChange={(v) => setT({ ...t, difficulty: v })} options={DIFFICULTIES.map((d) => ({ value: d, label: cap(d) }))} /></Field>
        </div>
      )}
      <Field label="What you did and what came of it" hint="The rubric reads this, plus the text of a PDF, Word or text file. It can't open links.">
        <TextArea rows={4} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button className="self-end" disabled={!ready} busy={busy} onClick={submit}>Submit evidence</Button>
    </div>
  );
}
