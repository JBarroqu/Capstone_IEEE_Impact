"""Admin routes (from the Wish Engine; ADMIN_PASSWORD login with a signed 12 h cookie, D-47). Adds the policies page
(D-52), endorsements (D-24), any user's growth state and evidence re-scoring; "delete TEST sessions" is gone (D-46)."""
import time
from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

from ... import policies
from ...config import config
from ...llm.backends import get_backends
from ...llm.chain import run_chain
from ...llm.health import health
from ...llm.prefs import get_preferred_backend, set_preferred_backend
from ...llm.run import LlmTask
from ...policies.defaults import POLICIES
from ...policies.loader import PolicyError, set_admin, source
from ..admin_auth import ADMIN_COOKIE, ADMIN_MAX_AGE_S, admin_password_problem, is_admin, new_admin_token, password_ok
from ..http import ok, read_json
from ..jsutil import js_number, js_str
from ..rate_limit import limited, rules
from ..security import client_ip, forwarded_for, is_https, is_local
from . import analytics as an
from .admin_data import load_data, parse_filters
from .csv_export import to_csv

router = APIRouter(prefix="/api/admin")
UNAUTH = lambda: JSONResponse({"ok": False}, status_code=401)  # noqa: E731


@router.post("/login")
async def login(req: Request):
    if rl := limited((rules.login_ip, client_ip(req))):
        return rl
    if problem := admin_password_problem():
        return JSONResponse({"ok": False, "error": f"{problem} Set it in .env and restart."}, status_code=503)
    # Over plain http from another machine the password crosses the network in cleartext.
    if not is_https(req) and not is_local(req) and not config.admin_allow_http:
        return JSONResponse({"ok": False, "error": "Open admin over https, or on localhost."}, status_code=403)
    body = await read_json(req, 1024)
    pw = body.get("password") if isinstance(body, dict) else None
    if not pw or not isinstance(pw, str) or not await password_ok(pw):
        return JSONResponse({"ok": False, "error": "Wrong password."}, status_code=401)
    res = JSONResponse({"ok": True})
    # Secure only over HTTPS: a Secure cookie is dropped on plain-http URLs.
    res.set_cookie(ADMIN_COOKIE, await new_admin_token(), httponly=True, samesite="strict", path="/", max_age=ADMIN_MAX_AGE_S, secure=is_https(req))
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
    if not await is_admin(req):
        return UNAUTH()
    if rl := limited((rules.admin_models_ip, client_ip(req))):
        return rl
    body = await read_json(req, 1024)
    action = body.get("action") if isinstance(body, dict) else None
    if action == "prefer" and "id" in body and (body["id"] is None or isinstance(body["id"], str)):
        await set_preferred_backend(body["id"])
        return ok()
    if action == "refresh":
        return ok(count=len(await get_backends(True)))
    if action != "test":
        return JSONResponse({"ok": False, "error": "invalid action"}, status_code=400)
    # test: one small classification call per model, updating the shared health so the chain reacts right away.
    from ...modules.wish.prompts.classify_v1 import build_classify_prompt, classify_json_schema, parse_classify

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


@router.get("/export/{kind}")
async def export(kind: str, req: Request):
    if not await is_admin(req):
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
    if not await is_admin(req):
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


@router.post("/logout")
async def logout():
    res = JSONResponse({"ok": True})
    res.delete_cookie(ADMIN_COOKIE, path="/")
    return res


@router.get("/session")
async def admin_session(req: Request):
    return ok(admin=await is_admin(req))


@router.get("/client-ip")
async def client_ip_check(req: Request):
    """What the rate limits see as this browser's address (check after deploying)."""
    if not await is_admin(req):
        return UNAUTH()
    return ok(ip=client_ip(req), forwardedFor=forwarded_for(req), trustProxy=config.trust_proxy,
              proxyHops=config.proxy_hops, https=is_https(req))


@router.get("/policies")
async def list_policies(req: Request):
    """Every switchable decision with its value and where the value comes from (default, env, admin)."""
    if not await is_admin(req):
        return UNAUTH()
    await policies.refresh(force=True)
    return ok(editable=config_editable(), policies=[{
        "key": p.key, "decision": p.decision, "module": p.module, "owner": p.owner, "kind": p.kind,
        "description": p.description, "choices": list(p.choices), "allowedItems": list(p.allowed_items), "min": p.min,
        "max": p.max, "default": p.default, "value": policies.get(p.key), "source": source(p.key),
        "adminEditable": p.admin_editable} for p in POLICIES])


def config_editable() -> bool:
    import os

    return os.environ.get("POLICY_ADMIN_EDIT", "true").lower() not in ("0", "false", "no")


class PolicySet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    value: Any = None  # None clears the admin override


@router.put("/policies")
async def put_policy(req: Request):
    if not await is_admin(req):
        return UNAUTH()
    if not config_editable():
        return JSONResponse({"ok": False, "error": "Policy editing on this page is switched off (POLICY_ADMIN_EDIT)."}, status_code=403)
    body = await read_json(req, 4096)
    try:
        p = PolicySet.model_validate(body)
        value = await set_admin(p.key, p.value)
    except (PolicyError, ValueError) as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    return ok(key=p.key, value=value, source=source(p.key))


class EndorseBody(BaseModel):
    userHandle: str
    skillId: str
    tier: Literal["Verified", "Mentor"] = "Verified"
    note: str | None = None


@router.post("/endorsements")
async def endorse(req: Request):
    """D-24 Verified needs an endorsement; tier Mentor marks someone as a senior reviewer (open question Q1 default)."""
    if not await is_admin(req):
        return UNAUTH()
    from ...modules.growth import service as growth_service
    from ...modules.profile import api as profile_api

    try:
        b = EndorseBody.model_validate(await read_json(req, 2048))
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    found = await profile_api.find_user(handle=b.userHandle)
    if not found:
        return JSONResponse({"ok": False, "error": "No user with that handle."}, status_code=404)
    await growth_service.endorse(found[0]["userId"], b.skillId, b.tier, b.note)
    return ok()


@router.get("/users/{handle}/growth")
async def user_growth(handle: str, req: Request):
    if not await is_admin(req):
        return UNAUTH()
    from ...modules.growth import api as growth_api
    from ...modules.profile import api as profile_api

    found = await profile_api.find_user(handle=handle)
    if not found:
        return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
    return ok(growth=(await growth_api.get_growth_state(found[0]["userId"])).model_dump(mode="json"))


@router.post("/evidence/{evidence_id}/rescore")
async def rescore(evidence_id: str, req: Request):
    if not await is_admin(req):
        return UNAUTH()
    from sqlalchemy import select, update

    from ... import db
    from ...modules.growth import service as growth_service
    from ...modules.growth.tables import evidence

    async with db.tx() as c:
        r = (await c.execute(select(evidence.c.summary, evidence.c.status).where(evidence.c.id == evidence_id))).first()
        if not r or r.status not in ("ai_error", "awaiting_review", "scoring"):
            return JSONResponse({"ok": False, "error": "Only unfinished evidence can be re-scored."}, status_code=409)
        await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(status="scoring"))
    await growth_service.run_scoring(evidence_id, r.summary)
    return ok()
