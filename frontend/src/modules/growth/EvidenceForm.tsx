/* Module 3: submit evidence for a selected move. Skill, activity type and difficulty come from the move (D-11), unless
   MOVE_TAGS_SOURCE=user. */
import { useRef, useState } from "react";
import { Button, Chip, ChipRow, ErrorNote, Field, Input, TextArea } from "@/components/ui";
import { ApiError, upload } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { track } from "@/lib/track";
import type { Evidence } from "@/lib/types";

export function EvidenceForm({ selectedMoveId, revisionOf, onSubmitted }: { selectedMoveId: string; revisionOf?: string; onSubmitted: (e: Evidence) => void }) {
  const { policy } = useConfig();
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
          {policy("VALIDATION_MODE") === "ai_only" ? "It's scored right away." : "It's scored right away, then your reviewer confirms it."}
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
      <Field label="What you did and what came of it" hint="The rubric reads this, plus the text of a PDF, Word or text file. It can't open links.">
        <TextArea rows={4} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button className="self-end" disabled={!ready} busy={busy} onClick={submit}>Submit evidence</Button>
    </div>
  );
}
