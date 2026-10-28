from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, select

from . import db


def parse_filters(q: dict) -> dict:
    return {k: (q.get(k) or None) for k in ("from", "to", "participant", "provider")}


def _day(s: str) -> datetime:
    """new Date("YYYY-MM-DD") in JS is midnight UTC."""
    try:
        return datetime.combine(date.fromisoformat(s), datetime.min.time(), timezone.utc)
    except ValueError:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))


def event_row(r) -> dict:
    return {"id": str(r.id), "createdAt": r.created_at, "clientTs": r.client_ts, "sessionId": str(r.session_id),
            "wishId": str(r.wish_id) if r.wish_id else None, "participantCode": r.participant_code, "provider": r.provider,
            "name": r.name, "step": r.step, "payload": r.payload or {}}


def wish_row(r) -> dict:
    return {"id": str(r.id), "sessionId": str(r.session_id), "text": r.text, "type": r.type, "focus": r.focus, "domains": r.domains,
            "archetype": r.archetype, "why": r.why, "priorAttempts": r.prior_attempts, "followUps": r.follow_ups}


async def load_data(f: dict) -> dict:
    e = db.events.c
    conds = []
    if f.get("from"):
        conds.append(e.created_at >= _day(f["from"]))
    if f.get("to"):
        conds.append(e.created_at <= _day(f["to"]) + timedelta(days=1))
    if f.get("participant"):
        conds.append(e.participant_code == f["participant"])
    if f.get("provider"):
        conds.append(e.provider == f["provider"])
    async with db.engine().connect() as c:
        q = select(db.events)
        if conds:
            q = q.where(and_(*conds))
        events = [event_row(r) for r in (await c.execute(q.order_by(e.created_at))).all()]
        wish_ids = list(dict.fromkeys(x["wishId"] for x in events if x["wishId"]))
        wishes = [wish_row(r) for r in (await c.execute(select(db.wishes).where(db.wishes.c.id.in_(wish_ids)))).all()] if wish_ids else []
        gen = (await c.execute(select(db.generated_moves))).all()
        # All sessions, oldest first: stable anonymous labels (P1, P2, ...) and the participant picker.
        sessions = [{"id": str(r.id), "participant": r.participant_code, "createdAt": r.created_at}
                    for r in (await c.execute(select(db.sessions.c.id, db.sessions.c.participant_code, db.sessions.c.created_at).order_by(db.sessions.c.created_at))).all()]
    meta = {}
    for g in gen:
        m = g.move or {}
        meta[g.id] = {"id": g.id, "title": m.get("title"), "step": m.get("step"), "focus": m.get("focus"), "cost": m.get("cost"), "source": "generated"}
    generated = [{"id": g.id, "move": g.move} for g in gen]
    return {"events": events, "wishes": wishes, "meta": meta, "generated": generated, "sessions": sessions}
