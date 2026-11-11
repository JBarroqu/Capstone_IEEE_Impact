export function minutesLabel(m: number) {
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 10 ? `${Math.round(h * 10) / 10} hr` : `${Math.round(h)} hr`;
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** 0 -> "0", 22.8 -> "22.8", 23.25 -> "23.25" (never an empty string). */
export const pts = (n: number | null | undefined) => {
  if (n == null) return "";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const STATUS_LABEL: Record<string, string> = {
  active: "To do", evidence_submitted: "Scoring", awaiting_review: "Waiting for review", validated: "Validated",
  needs_work: "Needs work", abandoned: "Closed", scoring: "Scoring", ai_scored: "Scored", ai_error: "Scoring failed",
};
