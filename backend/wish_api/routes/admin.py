import json
import time
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select, text

from .. import analytics as an
from .. import db
from ..admin_auth import ADMIN_COOKIE, is_admin, password_ok, token_for
from ..admin_data import load_data, parse_filters
from ..csv_export import to_csv
from ..jsutil import js_number, js_str
from ..prompts.classify_v1 import build_classify_prompt, classify_json_schema, parse_classify
from ..providers.backends import get_backends
from ..providers.health import health
from ..providers.llm import run_chain
from ..providers.prefs import get_preferred_backend, set_preferred_backend
from ..providers.run import LlmTask
from .common import ok, read_json

router = APIRouter(prefix="/api/admin")
UNAUTH = lambda: JSONResponse({"ok": False}, status_code=401)  # noqa: E731


@router.post("/login")
async def login(req: Request):
    body = await read_json(req)
    pw = body.get("password") if isinstance(body, dict) else None
    if not pw or not isinstance(pw, str) or not password_ok(pw):
        return JSONResponse({"ok": False, "error": "Wrong password."}, status_code=401)
    res = JSONResponse({"ok": True})
    # Secure only over HTTPS: a Secure cookie is dropped on plain-http LAN URLs (e.g. http://192.168.x.x:8000).
    https = (req.headers.get("x-forwarded-proto") or req.url.scheme) == "https"
    res.set_cookie(ADMIN_COOKIE, token_for(pw), httponly=True, samesite="lax", path="/", max_age=60 * 60 * 12, secure=https)
    return res


class Prefer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    action: Literal["prefer"]
    id: str | None


class Simple(BaseModel):
    action: Literal["test", "refresh"]


@router.post("/models")
async def models(req: Request):
    """Admin model controls: choose which model to try first, ping every model, or re-list available models."""
    if not is_admin(req):
        return UNAUTH()
    body = await read_json(req)
    action = body.get("action") if isinstance(body, dict) else None
    if action == "prefer" and "id" in body and (body["id"] is None or isinstance(body["id"], str)):
        await set_preferred_backend(body["id"])
        return ok()
    if action == "refresh":
        return ok(count=len(await get_backends(True)))
    if action != "test":
        return JSONResponse({"ok": False, "error": "invalid action"}, status_code=400)
    # test: one small classification call per model, updating the shared health so the chain reacts right away.
    task = LlmTask(schema=classify_json_schema, build=lambda h: build_classify_prompt("Land a new-grad SWE offer", h), parse=parse_classify)
    results = []
    for b in await get_backends():
        t = time.monotonic()
        try:
            await run_chain(task, backends=lambda b=b: _one(b), preferred=_none, budget_ms=15_000)
            results.append({"id": b.id, "ok": True, "ms": round((time.monotonic() - t) * 1000)})
        except Exception as e:
            results.append({"id": b.id, "ok": False, "ms": round((time.monotonic() - t) * 1000), "error": str(e)[:160]})
    return ok(results=results, health=health.snapshot())


async def _one(b):
    return [b]


async def _none():
    return None


# Test codes are "TEST" in capitals followed by a space, dash or underscore ("TEST Waleed", "TEST-3"); "Tester" is not one.
TEST_CODE = "^TEST[ _-]"


async def _test_sessions(c) -> list[dict]:
    rows = list((await c.execute(select(db.sessions.c.id, db.sessions.c.participant_code).where(db.sessions.c.participant_code.op("~")(TEST_CODE)))).all())
    rows += list((await c.execute(select(db.events.c.session_id, db.events.c.participant_code).distinct().where(db.events.c.participant_code.op("~")(TEST_CODE)))).all())
    seen: dict[str, str] = {}
    for id, code in rows:
        seen[str(id)] = code
    return [{"id": k, "code": v} for k, v in seen.items()]


@router.get("/delete-test")
async def delete_test_preview(req: Request):
    """Preview: which sessions a delete would remove."""
    if not is_admin(req):
        return UNAUTH()
    async with db.engine().connect() as c:
        s = await _test_sessions(c)
    return ok(count=len(s), codes=sorted({x["code"] for x in s}))


@router.post("/delete-test")
async def delete_test(req: Request):
    """Deletes test sessions (and their events, wishes, generated moves). The client passes the count it previewed."""
    if not is_admin(req):
        return UNAUTH()
    body = await read_json(req)
    expect = body.get("expect") if isinstance(body, dict) else None
    async with db.engine().begin() as c:
        ids = [s["id"] for s in await _test_sessions(c)]
        # Something changed since the preview (a new test, or a code that now matches): make the admin look again.
        if expect != len(ids):
            return JSONResponse({"ok": False, "reason": "changed", "count": len(ids)}, status_code=409)
        if ids:
            for t in (db.events, db.wishes, db.generated_moves):
                await c.execute(delete(t).where(t.c.session_id.in_(ids)))
            await c.execute(delete(db.sessions).where(db.sessions.c.id.in_(ids)))
    return ok(deleted=len(ids))


@router.get("/export/{kind}")
async def export(kind: str, req: Request):
    if not is_admin(req):
        return Response("Unauthorized", status_code=401)
    d = await load_data(parse_filters(dict(req.query_params)))
    rows = (an.events_rows(d["events"]) if kind == "events" else an.choices_rows(d["events"], d["wishes"]) if kind == "choices"
            else an.feedback_rows(d["events"], d["wishes"]) if kind == "feedback" else an.leaderboard(d["events"], d["meta"]) if kind == "moves" else None)
    if rows is None:
        return Response("Not found", status_code=404)
    return Response(to_csv(rows), media_type="text/csv; charset=utf-8", headers={"content-disposition": f'attachment; filename="{kind}.csv"'})


def _ago(t: float | None) -> str:
    return "" if t is None else f"{max(0, round((time.time() * 1000 - t) / 60_000))} min ago"


async def _model_rows() -> dict:
    try:
        backends = await get_backends()
    except Exception:
        backends = []
    try:
        preferred = await get_preferred_backend()
    except Exception:
        preferred = None
    rows = []
    for b in health.order(backends, preferred):
        h = health.get(b.id)
        status = "gone" if h.gone else "cooling" if health.cooling(b.id) else "ok" if h.lastOkAt else "untested"
        if status == "ok":
            note = f"answered {_ago(h.lastOkAt)} in {js_str(h.lastLatencyMs)} ms"
        elif status == "untested":
            note = "not called yet"
        else:
            note = f"{h.lastError or ''} · retry in {max(1, round((h.coolUntil - time.time() * 1000) / 60_000))} min"
        rows.append({"id": b.id, "status": status, "note": note})
    return {"rows": rows, "preferred": preferred}


def _tally(xs: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for x in xs:
        out[x] = out.get(x, 0) + 1
    return out


@router.get("/dashboard")
async def dashboard(req: Request):
    """Everything the admin page shows, computed here (the page only renders it)."""
    if not is_admin(req):
        return UNAUTH()
    try:
        d = await load_data(parse_filters(dict(req.query_params)))
    except Exception:
        return JSONResponse({"ok": False, "reason": "db"}, status_code=503)
    events, wishes, meta = d["events"], d["wishes"], d["meta"]
    shown = [e for e in events if e["name"] == "options_shown" and not e["payload"].get("cache_hit")]

    def usage(ev):
        lat = sorted(n for n in (js_number(e["payload"].get("latency_ms")) for e in ev) if n == n)
        i = len(ev) // 2
        return {"n": len(ev), "median": (int(lat[i]) if lat[i].is_integer() else lat[i]) if i < len(lat) else None,
                "failover": len([e for e in ev if e["payload"].get("tried")])}

    return ok(
        eventCount=len(events), wishCount=len(wishes),
        sessions=[{"id": s["id"], "participant": s["participant"]} for s in d["sessions"]],
        journeys=an.journeys(events, wishes), meta=meta, generated={g["id"]: g["move"] for g in d["generated"]},
        models=await _model_rows(),
        usage=an.group_by(shown, lambda e: f"{js_str(e['payload'].get('used_provider') or '?') if e['payload'].get('used_provider') is not None else '?'}:{js_str(e['payload'].get('model')) if e['payload'].get('model') is not None else '?'}", usage),
        classSrc=_tally([js_str(e["payload"]["source"]) if e["payload"].get("source") is not None else "keywords (old)" for e in events if e["name"] == "classification_guessed"]),
        failedLoads=len([e for e in events if e["name"] == "options_failed"]),
        funnel=an.funnel(events), leaderboard=an.leaderboard(events, meta), rejectReasons=an.reject_reasons(events),
        feedback=an.feedback(events, wishes),
        byProvider=an.group_by(events, lambda e: e["provider"] or "unknown", an.key_numbers),
        wishTallies={
            "area": _tally([x for w in wishes for x in (w.get("domains") or [])]),
            "focus": _tally([x for w in wishes for x in (w.get("focus") or [])]),
            "finish": _tally(["clear" if w.get("type") == "fixed" else "open-ended" for w in wishes]),
            "archetype": _tally([w.get("archetype") or "none" for w in wishes]),
        },
    )
