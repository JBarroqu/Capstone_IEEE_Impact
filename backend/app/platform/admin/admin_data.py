"""Loads analytics rows for the admin dashboard (from the Wish Engine), keyed by user instead of a typed participant
name (D-46). The analytics functions are unchanged: a row's "sessionId" is now the user id and "participantCode" the
user's handle. Admin reads module tables directly (read-only reporting; the only place outside a module that does)."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, select

from ... import db
from ...modules.profile.tables import profiles
from ...modules.wish.tables import moves, wishes


def parse_filters(q: dict) -> dict:
    return {k: (q.get(k) or None) for k in ("from", "to", "participant", "provider")}


def _day(s: str) -> datetime:
    try:
        return datetime.combine(date.fromisoformat(s), datetime.min.time(), timezone.utc)
    except ValueError:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))


def event_row(r, handles: dict) -> dict:
    uid = str(r.user_id)
    return {"id": str(r.id), "createdAt": r.created_at, "clientTs": r.client_ts, "sessionId": uid,
            "wishId": str(r.wish_id) if r.wish_id else None, "participantCode": handles.get(uid) or uid[:8], "provider": r.provider,
            "name": r.name, "step": r.step, "payload": r.payload or {}}


def wish_row(r) -> dict:
    return {"id": str(r.id), "sessionId": str(r.user_id), "text": r.text, "type": r.type, "focus": r.focus, "domains": r.domains,
            "archetype": r.archetype, "why": r.why, "priorAttempts": r.prior_attempts, "followUps": r.follow_ups}


async def load_data(f: dict) -> dict:
    e = db.events.c
    async with db.read() as c:
        users = [{"id": str(r.user_id), "participant": r.handle or str(r.user_id)[:8], "createdAt": r.created_at}
                 for r in (await c.execute(select(profiles.c.user_id, profiles.c.handle, profiles.c.created_at)
                                           .order_by(profiles.c.created_at))).all()]
        handles = {u["id"]: u["participant"] for u in users}
        conds = []
        if f.get("from"):
            conds.append(e.created_at >= _day(f["from"]))
        if f.get("to"):
            conds.append(e.created_at <= _day(f["to"]) + timedelta(days=1))
        if f.get("participant"):
            ids = [u["id"] for u in users if u["participant"] == f["participant"] or u["id"] == f["participant"]]
            conds.append(e.user_id.in_(ids or ["00000000-0000-0000-0000-000000000000"]))
        if f.get("provider"):
            conds.append(e.provider == f["provider"])
        q = select(db.events)
        if conds:
            q = q.where(and_(*conds))
        events = [event_row(r, handles) for r in (await c.execute(q.order_by(e.created_at))).all()]
        wish_ids = list(dict.fromkeys(x["wishId"] for x in events if x["wishId"]))
        ws = [wish_row(r) for r in (await c.execute(select(wishes).where(wishes.c.id.in_(wish_ids)))).all()] if wish_ids else []
        gen = (await c.execute(select(moves.c.id, moves.c.payload))).all()
    meta = {}
    for g in gen:
        m = g.payload or {}
        meta[str(g.id)] = {"id": str(g.id), "title": m.get("title"), "step": m.get("step"), "focus": m.get("focus"),
                           "cost": m.get("cost"), "source": "generated"}
    generated = [{"id": str(g.id), "move": g.payload} for g in gen]
    return {"events": events, "wishes": ws, "meta": meta, "generated": generated, "sessions": users}
