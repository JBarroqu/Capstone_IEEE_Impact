"""Presentation export: one row per rated wish with the wish, the student's answers, the options shown,
the move they picked and their 1-5 rating.
Usage: npm run export -- [--exclude=name1,name2] [--all]
  --exclude  participant names to leave out (case-insensitive)
  --all      include wishes that were never rated
Writes exports/results.csv and exports/results.md (exports/ is git-ignored: it holds participant data)."""
import asyncio
import sys
from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from wish_api import db
from wish_api.admin_data import event_row, wish_row
from wish_api.analytics import journeys
from wish_api.archetypes import archetype_info, quiz
from wish_api.config import ROOT
from wish_api.csv_export import to_csv
from wish_api.jsutil import js_round, js_str
from wish_api.vocab import DOMAIN_LABEL, FOCUS_LABEL


def arg(k: str) -> str | None:
    return next((a.split("=")[1] for a in sys.argv if a.startswith(f"--{k}=")), None)


exclude = {s.strip().lower() for s in (arg("exclude") or "").split(",") if s.strip()}
include_all = "--all" in sys.argv


def phoenix(iso: str) -> str:
    """toLocaleString("en-US", {timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})."""
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Phoenix"))
    return f"{d:%b} {d.day}, {(d.hour % 12) or 12}:{d:%M} {'AM' if d.hour < 12 else 'PM'}"


def _to_fixed1(x: float) -> str:
    """(x).toFixed(1): halves round up, on the exact binary value."""
    return str(Decimal(x).quantize(Decimal("0.1"), ROUND_HALF_UP))


async def main():
    async with db.engine().connect() as c:
        events = [event_row(r) for r in (await c.execute(select(db.events))).all()]
        wishes = [wish_row(r) for r in (await c.execute(select(db.wishes))).all()]
        gen = (await c.execute(select(db.generated_moves))).all()
    await db.engine().dispose()
    move_by_id = {g.id: g.move for g in gen}
    title = lambda id: (move_by_id.get(id) or {}).get("title") or id  # noqa: E731
    wish_by_id = {w["id"]: w for w in wishes}

    rows: list[dict] = []
    for j in reversed(journeys(events, wishes)):
        if j["participant"].lower() in exclude:
            continue
        se = [e for e in events if e["sessionId"] == j["sessionId"]]
        for w in j["wishes"]:
            if not include_all and w["rating"] is None:
                continue
            # Quiz answers live on the wish where the quiz was taken (only the first wish of a session).
            answers = {e["payload"].get("q"): e["payload"].get("answer") for e in se if e["name"] == "quiz_answered"}
            skipped = any(e["name"] == "quiz_skipped" for e in se)
            # Generated questions differ per wish, so the columns hold "question → answer"; older rows used the fixed quiz.
            quiz_cols = {}
            if w["questions"]:
                for i, q in enumerate(w["questions"]["items"]):
                    quiz_cols[f"Question {i + 1}"] = f"{q['question']} → {q['answer'] if q['answer'] is not None else ('(skipped)' if w['questions']['skipped'] else '–')}"
            else:
                for i, q in enumerate(quiz):
                    label = next((a["label"] for a in q["answers"] if a["id"] == answers.get(q["id"])), None)
                    quiz_cols[f"Question {i + 1}"] = f"{q['prompt']} → {label if label is not None else ('(skipped)' if skipped else '–')}"
            prior = (wish_by_id.get(w["wishId"] or "") or {}).get("priorAttempts")
            rounds = next((s["rounds"] for s in w["steps"] if s["step"] == 1), [])
            picked = next((r["outcome"] for r in rounds if r["outcome"]["kind"] == "picked"), None)
            shown_cols = {}
            for ri, r in enumerate(rounds):
                label = f"Set {ri + 1} " if len(rounds) > 1 else ""
                for i, id in enumerate(r["moveIds"]):
                    shown_cols[f"{label}Option {i + 1}"] = title(id)
                if r["outcome"]["kind"] == "rejected":
                    shown_cols[f"{label}Rejected because"] = r["outcome"]["reason"]
            tried = "; ".join(x for x in [*((prior or {}).get("chips") or []), (prior or {}).get("text")] if x)
            rows.append({
                "Participant": j["participant"],
                "Date": phoenix(j["started"]),
                "Wish": w["text"],
                "Why (their words)": w["why"] or "(skipped)",
                "Already tried": tried or "(skipped)",
                **quiz_cols,
                "Archetype": archetype_info.get(w["archetype"], {}).get("label", w["archetype"]) if w["archetype"] else "",
                "Kind of wish": ", ".join(FOCUS_LABEL.get(f, f) for f in w["focus"]),
                "Area": ", ".join(DOMAIN_LABEL.get(d, d) for d in w["domains"]),
                **shown_cols,
                "Picked move": title(picked["moveId"]) if picked else "(none)",
                "Picked move detail": ((move_by_id.get(picked["moveId"]) or {}).get("detail") or "") if picked else "",
                "Picked position": picked["position"] + 1 if picked and picked["position"] is not None else "",
                "Seconds to decide": js_round(picked["ms"] / 1000) if picked and picked["ms"] is not None else "",
                "Usefulness (1-5)": w["rating"] if w["rating"] is not None else "",
            })

    out = ROOT / "exports"
    out.mkdir(exist_ok=True)
    (out / "results.csv").write_text(to_csv(rows), encoding="utf-8")
    avg = [float(r["Usefulness (1-5)"]) for r in rows if isinstance(r["Usefulness (1-5)"], (int, float))]
    md = [
        "# Wish Engine: first-move results",
        "",
        f"{len(rows)} participant{'' if len(rows) == 1 else 's'} · average usefulness {_to_fixed1(sum(avg) / len(avg)) if avg else '–'} / 5",
        "",
    ]
    for r in rows:
        md += [f'## {r["Participant"]}: "{r["Wish"]}"', "", f"- **Why:** {r['Why (their words)']}", f"- **Already tried:** {r['Already tried']}"]
        md += [f"- {r[f'Question {i}']}" for i in (1, 2, 3) if r.get(f"Question {i}")]
        md += [f"- **Archetype:** {r['Archetype'] or '–'} · **Kind of wish:** {r['Kind of wish'] or '–'} · **Area:** {r['Area'] or '–'}", "", "**Options shown**", ""]
        md += [f"- {k}: {f'**{v}** (picked)' if v == r['Picked move'] else v}" for k, v in r.items() if ("Option " in k and k.split("Option ")[-1].isdigit()) or "Rejected because" in k]
        detail = f". {r['Picked move detail']}" if r["Picked move detail"] else ""
        md += ["", f"**Picked:** {r['Picked move']}{detail}", "", f"**Usefulness:** {js_str(r['Usefulness (1-5)']) if r['Usefulness (1-5)'] != '' else '–'} / 5", ""]
    (out / "results.md").write_text("\n".join(md), encoding="utf-8")
    print(f"wrote exports/results.csv and exports/results.md ({len(rows)} rows)")


asyncio.run(main())
