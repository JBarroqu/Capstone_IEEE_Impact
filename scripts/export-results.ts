/**
 * Presentation export: one row per rated wish with the wish, the student's answers, the options shown,
 * the move they picked and their 1-5 rating.
 * Usage: npx tsx scripts/export-results.ts [--exclude=name1,name2] [--all]
 *   --exclude  participant names to leave out (case-insensitive)
 *   --all      include wishes that were never rated
 * Writes exports/results.csv and exports/results.md (exports/ is git-ignored: it holds participant data).
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { getDb, schema } from "../lib/db/client";
import { journeys, type EventRow, type WishRow } from "../lib/analytics";
import { quiz, archetypeInfo } from "../lib/archetypes";
import { toCsv } from "../lib/csv";
import { DOMAIN_LABEL, FOCUS_LABEL, type Archetype, type Domain, type Focus } from "../lib/types";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const exclude = new Set((arg("exclude") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const all = process.argv.includes("--all");

async function main() {
  const db = getDb();
  const events = (await db.select().from(schema.events)) as unknown as EventRow[];
  const wishes = (await db.select().from(schema.wishes)) as unknown as (WishRow & { priorAttempts: { chips: string[]; text?: string } | null })[];
  const gen = await db.select().from(schema.generatedMoves);
  const moveById = new Map<string, { title: string; detail: string; minutes?: number; cost?: string }>();
  for (const g of gen) moveById.set(g.id, g.move as never);
  const title = (id: string) => moveById.get(id)?.title ?? id;
  const wishById = new Map(wishes.map((w) => [w.id, w]));

  const rows: Record<string, string | number>[] = [];
  for (const j of journeys(events, wishes).reverse()) {
    if (exclude.has(j.participant.toLowerCase())) continue;
    const se = events.filter((e) => e.sessionId === j.sessionId);
    for (const w of j.wishes) {
      if (!all && w.rating == null) continue;
      // Quiz answers live on the wish where the quiz was taken (only the first wish of a session).
      const answers = Object.fromEntries(se.filter((e) => e.name === "quiz_answered").map((e) => [e.payload.q, e.payload.answer]));
      const skipped = se.some((e) => e.name === "quiz_skipped");
      // Generated questions differ per wish, so the columns hold "question → answer"; older rows used the fixed quiz.
      const quizCols: Record<string, string> = {};
      if (w.questions) {
        w.questions.items.forEach((q, i) => { quizCols[`Question ${i + 1}`] = `${q.question} → ${q.answer ?? (w.questions!.skipped ? "(skipped)" : "–")}`; });
      } else {
        quiz.forEach((q, i) => {
          quizCols[`Question ${i + 1}`] = `${q.prompt} → ${q.answers.find((a) => a.id === answers[q.id])?.label ?? (skipped ? "(skipped)" : "–")}`;
        });
      }
      const prior = wishById.get(w.wishId ?? "")?.priorAttempts;
      const rounds = w.steps.find((s) => s.step === 1)?.rounds ?? [];
      const picked = rounds.flatMap((r) => (r.outcome.kind === "picked" ? [r.outcome] : []))[0];
      const shownCols: Record<string, string> = {};
      rounds.forEach((r, ri) => {
        const label = rounds.length > 1 ? `Set ${ri + 1} ` : "";
        r.moveIds.forEach((id, i) => { shownCols[`${label}Option ${i + 1}`] = title(id); });
        if (r.outcome.kind === "rejected") shownCols[`${label}Rejected because`] = r.outcome.reason;
      });
      rows.push({
        Participant: j.participant,
        Date: j.started.toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        Wish: w.text,
        "Why (their words)": w.why || "(skipped)",
        "Already tried": [...(prior?.chips ?? []), prior?.text].filter(Boolean).join("; ") || "(skipped)",
        ...quizCols,
        Archetype: w.archetype ? archetypeInfo[w.archetype as Archetype]?.label ?? w.archetype : "",
        "Kind of wish": w.focus.map((f) => FOCUS_LABEL[f as Focus] ?? f).join(", "),
        Area: w.domains.map((d) => DOMAIN_LABEL[d as Domain] ?? d).join(", "),
        ...shownCols,
        "Picked move": picked ? title(picked.moveId) : "(none)",
        "Picked move detail": picked ? moveById.get(picked.moveId)?.detail ?? "" : "",
        "Picked position": picked?.position != null ? picked.position + 1 : "",
        "Seconds to decide": picked?.ms != null ? Math.round(picked.ms / 1000) : "",
        "Usefulness (1-5)": w.rating ?? "",
      });
    }
  }

  mkdirSync("exports", { recursive: true });
  writeFileSync("exports/results.csv", toCsv(rows));
  const avg = rows.filter((r) => typeof r["Usefulness (1-5)"] === "number").map((r) => Number(r["Usefulness (1-5)"]));
  const md = [
    "# Wish Engine: first-move results",
    "",
    `${rows.length} participant${rows.length === 1 ? "" : "s"} · average usefulness ${avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : "–"} / 5`,
    "",
    ...rows.flatMap((r) => [
      `## ${r.Participant}: "${r.Wish}"`,
      "",
      `- **Why:** ${r["Why (their words)"]}`,
      `- **Already tried:** ${r["Already tried"]}`,
      ...[1, 2, 3].flatMap((i) => (r[`Question ${i}`] ? [`- ${r[`Question ${i}`]}`] : [])),
      `- **Archetype:** ${r.Archetype || "–"} · **Kind of wish:** ${r["Kind of wish"] || "–"} · **Area:** ${r.Area || "–"}`,
      "",
      "**Options shown**",
      "",
      ...Object.entries(r).filter(([k]) => /Option \d|Rejected because/.test(k)).map(([k, v]) => `- ${k}: ${v === r["Picked move"] ? `**${v}** (picked)` : v}`),
      "",
      `**Picked:** ${r["Picked move"]}${r["Picked move detail"] ? `. ${r["Picked move detail"]}` : ""}`,
      "",
      `**Usefulness:** ${r["Usefulness (1-5)"] || "–"} / 5`,
      "",
    ]),
  ].join("\n");
  writeFileSync("exports/results.md", md);
  console.log(`wrote exports/results.csv and exports/results.md (${rows.length} rows)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
