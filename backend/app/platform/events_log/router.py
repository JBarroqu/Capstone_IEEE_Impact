"""Analytics event log (from the Wish Engine's /api/events). Batches come with the user's token; on page close
sendBeacon can't send a header, so the batch carries a signed 2-hour ticket instead (T-13)."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy.dialects.postgresql import insert

from ... import db
from ...config import config
from ..auth import AuthError, CurrentUser, User, bearer, verify
from ..http import err, ok, parse, read_json
from ..rate_limit import limited, rules
from ..security import client_ip, get_secret, make_token, verify_token
from .schema import EventBatch

router = APIRouter(prefix="/api/v1")
TICKET_MS = 2 * 60 * 60 * 1000


@router.post("/events/ticket")
async def ticket(user: CurrentUser = User):
    return ok(ticket=make_token(await get_secret(), f"ev:{user.id}"), expiresInS=TICKET_MS // 1000)


async def _user(req: Request, batch: EventBatch) -> str | None:
    token = bearer(req)
    if token:
        try:
            return (await verify(token)).id
        except AuthError:
            return None
    if batch.ticket:
        payload = verify_token(await get_secret(), batch.ticket, TICKET_MS)
        if payload and payload.startswith("ev:"):
            return payload[3:]
    return None


@router.post("/events")
async def events(req: Request):
    if rl := limited((rules.events_ip, client_ip(req))):
        return rl
    data = await read_json(req, 65_536)
    if data is None:
        return err("invalid body")
    p = parse(EventBatch, data)
    if isinstance(p, JSONResponse):
        return p
    user_id = await _user(req, p)
    if not user_id:
        return err("unauthorized", 401)
    if rl := limited((rules.events_user, user_id)):
        return rl
    rows = []
    for e in p.events:
        row = {"user_id": user_id, "client_session_id": e.clientSessionId, "wish_id": e.wishId, "name": e.name, "step": e.step,
               "payload": e.payload, "app_version": config.app_version, "client_ts": e.clientTs,
               "provider": e.payload["used_provider"] if isinstance(e.payload.get("used_provider"), str) else None}
        if e.id:
            row["id"] = e.id
        rows.append(row)
    if rows:
        async with db.tx() as c:
            for group in ([r for r in rows if "id" in r], [r for r in rows if "id" not in r]):
                if group:
                    await c.execute(insert(db.events).values(group).on_conflict_do_nothing())
    return ok()
