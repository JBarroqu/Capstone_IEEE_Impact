"""Module 5: Opportunity & Event Return (owner JBarroqu). docs/modules/feed.md. Event_Ecosystem's notification centre,
fed by the other modules' domain events (D-38), with While You Were Away (D-39) and one best next move (D-40)."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from ... import db, policies
from ...contracts import DomainEvent, EventContext, FeedItem, WhileYouWereAway
from ...policies.notifications import rule_for
from .rules import categories
from .tables import notifications

log = logging.getLogger("impact.feed")
SOURCE = {"ProfileUpdated": "profile", "MoveSelected": "wish", "NextMoveReady": "wish", "InvitationCreated": "social",
          "InvitationAccepted": "social", "InvitationDeclined": "social", "FeedbackSubmitted": "social"}


async def on_event(ev: DomainEvent) -> None:
    """Subscriber for every domain event: at most one notification per event (dedupe_key)."""
    rule = rule_for(ev.name)
    if rule is None:
        return
    refs = ev.refs
    source_id = next((refs.get(k) for k in ("evidenceId", "selectedMoveId", "invitationId", "wishId", "opportunityId") if refs.get(k)), None)
    if ev.name == "NextMoveReady":
        key = f"next:{refs.get('wishId')}:{refs.get('step')}"
    elif ev.name in ("TierReached",):
        key = f"tier:{ev.userId}:{refs.get('skillId')}:{refs.get('tier')}"
    elif ev.name == "UnlockGranted":
        key = f"unlock:{ev.userId}:{refs.get('opportunityId')}"
    elif ev.name == "ProfileUpdated":
        key = f"profile:{ev.userId}:completed"
    else:
        key = f"{ev.name}:{source_id or ev.eventId}"
    import uuid as _uuid

    try:
        sid = str(_uuid.UUID(str(source_id))) if source_id else None
    except ValueError:
        sid = None
    async with db.tx() as c:
        await c.execute(insert(notifications).values(
            user_id=ev.userId, category=rule.category, kind=rule.kind, title=rule.title(refs)[:200],
            body=(rule.body(refs) or "")[:500], link=rule.link(refs), source_module=SOURCE.get(ev.name, "growth"),
            source_id=sid, dedupe_key=key, payload={k: v for k, v in refs.items() if isinstance(v, (str, int, float, bool, type(None)))},
        ).on_conflict_do_nothing(index_elements=[notifications.c.dedupe_key]))


def _item(r) -> FeedItem:
    return FeedItem(id=str(r.id), userId=str(r.user_id), category=r.category, kind=r.kind, title=r.title, body=r.body,
                    link=r.link, sourceModule=r.source_module, sourceId=str(r.source_id) if r.source_id else None,
                    createdAt=r.created_at, readAt=r.read_at)


async def list_feed(user_id: str, chip: str | None, unread: bool, query: str | None, before: str | None, limit: int = 30) -> dict:
    q = select(notifications).where(notifications.c.user_id == user_id)
    if chip:
        cats = categories(chip)
        if cats is None:
            return {"items": [], "unread": 0}
        q = q.where(notifications.c.category.in_(cats))
    if unread:
        q = q.where(notifications.c.read_at.is_(None))
    if query:
        like = f"%{query.strip()[:80]}%"
        q = q.where((notifications.c.title.ilike(like)) | (notifications.c.body.ilike(like)) | (notifications.c.category.ilike(like)))
    if before:
        q = q.where(notifications.c.created_at < before)
    async with db.read() as c:
        rows = (await c.execute(q.order_by(notifications.c.created_at.desc()).limit(limit))).all()
        n_unread = (await c.execute(select(func.count()).select_from(notifications).where(
            notifications.c.user_id == user_id, notifications.c.read_at.is_(None)))).scalar()
    return {"items": [_item(r) for r in rows], "unread": n_unread}


async def mark(user_id: str, item_id: str | None, read: bool) -> None:
    q = update(notifications).where(notifications.c.user_id == user_id)
    if item_id:
        q = q.where(notifications.c.id == item_id)
    async with db.tx() as c:
        await c.execute(q.values(read_at=func.now() if read else None))


async def event_context(user_id: str, last_seen, previous_seen) -> EventContext:
    mode = policies.get("WYWA_MODE")
    since = previous_seen if mode == "since_last_visit" else datetime.now(timezone.utc) - timedelta(days=int(mode.split(":")[1]))
    q = select(notifications).where(notifications.c.user_id == user_id)
    if since:
        q = q.where(notifications.c.created_at > since)
    async with db.read() as c:
        rows = (await c.execute(q.order_by(notifications.c.created_at.desc()).limit(50))).all() if since else []
    by: dict[str, int] = {}
    for r in rows:
        by[r.category] = by.get(r.category, 0) + 1
    return EventContext(userId=user_id, lastSeenAt=last_seen, previousSeenAt=previous_seen,
                        whileYouWereAway=WhileYouWereAway(count=len(rows), byCategory=by, items=[_item(r) for r in rows[:10]]))
