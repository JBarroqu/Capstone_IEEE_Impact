/* Module 4 on a move: invite a reviewer or tester (D-30, D-32), see their feedback. mike-branch's rules apply on the
   server: no self-invite, no re-invite, one accepted buddy per role. */
import { useEffect, useState } from "react";
import { Button, Chip, ChipRow, ErrorNote, Field, Input, Tag } from "@/components/ui";
import { ApiError, get, post } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { ago } from "@/lib/format";
import { track } from "@/lib/track";
import type { Person } from "@/lib/types";

type Fb = { id: string; role: string; rating: number | null; confirms: boolean | null; body: string; author: Person | null; createdAt: string };
type Bud = { invitationId: string; role: string; status: string; buddy: Person | null };

export function BuddyPanel({ selectedMoveId, open }: { selectedMoveId: string; open: boolean }) {
  const { policy } = useConfig();
  const roles: string[] = policy("BUDDY_ROLES") ?? ["reviewer", "tester"];
  const [data, setData] = useState<{ feedback: Fb[]; buddies: Bud[] } | null>(null);
  const [role, setRole] = useState(roles[0] ?? "reviewer");
  const [who, setWho] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get<{ feedback: Fb[]; buddies: Bud[] }>(`/api/v1/selected-moves/${selectedMoveId}/feedback`).then(setData).catch(() => {});
  useEffect(() => { void load(); }, [selectedMoveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async () => {
    setBusy(true); setError(null);
    try {
      await post("/api/v1/invitations", { selectedMoveId, buddy: who.trim().replace(/^@/, ""), role, message: msg.trim() || undefined });
      track("buddy_invited", { role });
      setWho(""); setMsg(""); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't send the invite."); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-5">
      <h3 className="text-base font-bold text-navy">Buddies</h3>
      {data?.buddies.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {data.buddies.map((b) => (
            <li key={b.invitationId} className="flex items-center gap-2">
              <span className="font-semibold">{b.buddy?.displayName ?? "Buddy"}</span>
              {b.buddy?.handle && <span className="text-secondary">@{b.buddy.handle}</span>}
              <Tag tone="pro">{b.role}</Tag>
              <Tag tone={b.status === "accepted" ? "growth" : "neutral"}>{b.status === "pending" ? "invited" : b.status}</Tag>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-secondary">A reviewer rates and confirms your evidence; a tester tries what you made and comments.</p>}

      {data?.feedback.map((f) => (
        <div key={f.id} className="rounded-lg bg-subpanel p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <strong>{f.author?.displayName ?? "Buddy"}</strong><Tag tone="pro">{f.role}</Tag>
            {f.rating != null && <Tag>{f.rating} of 5</Tag>}
            {f.confirms != null && <Tag tone={f.confirms ? "growth" : "impact"}>{f.confirms ? "Confirmed" : "Not confirmed"}</Tag>}
            <span className="ml-auto text-xs font-semibold text-time">{ago(f.createdAt)}</span>
          </div>
          {f.body && <p className="whitespace-pre-wrap text-text">{f.body}</p>}
        </div>
      ))}

      {open && (
        <div className="flex flex-col gap-3 border-t border-subpanel pt-3">
          {roles.length > 1 && <ChipRow label="Role">{roles.map((r) => <Chip key={r} on={role === r} onClick={() => setRole(r)}>{r === "reviewer" ? "Reviewer" : "Tester"}</Chip>)}</ChipRow>}
          <Field label="Invite by handle or email" hint={policy("BUDDY_DISCOVERY") === "exact" ? "Type the exact handle or email." : undefined}>
            <Input value={who} placeholder="@handle or name@asu.edu" onChange={(e) => setWho(e.target.value)} />
          </Field>
          <Field label="Message (optional)"><Input value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button className="self-end" kind="secondary" disabled={who.trim().length < 3} busy={busy} onClick={invite}>Send invite</Button>
        </div>
      )}
    </div>
  );
}
