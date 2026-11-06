"""Feed and Home routes (docs/API.md, Module 5)."""
from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder

from ...platform.auth import CurrentUser, User
from ...platform.http import ok, read_json
from . import next_move, service

router = APIRouter(prefix="/api/v1")


@router.get("/feed")
async def feed(chip: str | None = None, unread: bool = False, q: str | None = None, before: str | None = None,
               user: CurrentUser = User):
    r = await service.list_feed(user.id, chip, unread, q, before)
    return ok(items=[i.model_dump(mode="json") for i in r["items"]], unread=r["unread"])


@router.post("/feed/{item_id}/read")
async def read_item(item_id: str, req: Request, user: CurrentUser = User):
    body = await read_json(req, 256) or {}
    await service.mark(user.id, item_id, bool(body.get("read", True)) if isinstance(body, dict) else True)
    return ok()


@router.post("/feed/read-all")
async def read_all(user: CurrentUser = User):
    await service.mark(user.id, None, True)
    return ok()


@router.get("/home")
async def home(user: CurrentUser = User):
    """Everything Home shows in one call. Opening Home counts as a visit (D-39)."""
    from ..growth import api as growth_api
    from ..profile import api as profile_api
    from ..wish import api as wish_api

    prev, last = await profile_api.touch_seen(user.id)
    state = await profile_api.get_professional_state(user.id)
    growth = await growth_api.get_growth_state(user.id)
    ctx = await service.event_context(user.id, last, prev)
    best = await next_move.best(user.id)
    active = await wish_api.list_selected_moves(user.id, "active,evidence_submitted,awaiting_review,needs_work")
    return ok(**jsonable_encoder({
        "profileCard": {"displayName": state.displayName, "handle": state.handle, "headline": state.headline,
                        "targetCareer": growth_api.career_name(state.targetCareerId)},
        "growthSummary": {"impact": growth.totals.impact, "validated": growth.totals.validated, "pending": growth.totals.pending,
                          "effortCounted": growth.totals.effortCounted, "roleTier": growth.roleTier,
                          "skills": [s.model_dump() for s in growth.skills], "unlocks": len(growth.unlocks)},
        "eventContext": ctx.model_dump(mode="json"), "bestNextMove": best.model_dump(mode="json"), "activeMoves": active,
    }))
