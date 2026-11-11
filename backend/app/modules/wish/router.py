"""Wish routes (docs/API.md, Module 2). From the Wish Engine's routes/student.py, keyed by the signed-in user."""
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, conlist

from ...llm.errors import LlmUnavailable
from ...platform.auth import CurrentUser, User
from ...platform.http import UUID_RE, err, ok, parse, read_json
from ...platform.rate_limit import limited, rules
from ...platform.security import client_ip
from . import service
from .engine.wishes import wishes as starter_wishes
from .vocab import Archetype, Domain, Focus

router = APIRouter(prefix="/api/v1")
Uuid = Field(pattern=UUID_RE)


class Prior(BaseModel):
    chips: conlist(Annotated[str, Field(max_length=40)], max_length=10)
    text: str | None = Field(default=None, max_length=1000)


class FollowUp(BaseModel):
    question: str = Field(max_length=200)
    answer: str = Field(max_length=80)
    note: str | None = Field(default=None, max_length=200)


class WishBody(BaseModel):
    id: str = Uuid
    text: str | None = Field(default=None, min_length=1, max_length=500)
    fromChip: bool | None = None
    type: str | None = Field(default=None, pattern=r"^(open_ended|fixed)$")
    focus: conlist(Focus, max_length=10) | None = None
    domains: conlist(Domain, max_length=10) | None = None
    guessedType: str | None = Field(default=None, pattern=r"^(open_ended|fixed)$")
    guessedFocus: conlist(Focus, max_length=10) | None = None
    guessedDomains: conlist(Domain, max_length=10) | None = None
    archetype: Archetype | None = None
    why: str | None = Field(default=None, max_length=1000)
    priorAttempts: Prior | None = None
    followUps: conlist(FollowUp, max_length=5) | None = None


def _e(e: Exception):
    return err(str(e), getattr(e, "status", 400))


@router.get("/chips")
async def chips():
    return ok(chips=starter_wishes)


@router.get("/wishes")
async def list_wishes(user: CurrentUser = User):
    return ok(wishes=_j(await service.list_wishes(user.id)))


@router.get("/wishes/{wish_id}")
async def get_wish(wish_id: str, user: CurrentUser = User):
    try:
        return ok(wish=_j(await service.get_wish(user.id, wish_id)))
    except service.WishError as e:
        return _e(e)


@router.post("/wishes")
async def upsert(req: Request, user: CurrentUser = User):
    if rl := limited((rules.write_ip, client_ip(req))):
        return rl
    p = parse(WishBody, await read_json(req, 8192))
    if isinstance(p, JSONResponse):
        return p
    try:
        await service.upsert_wish(user.id, p.id, p.model_dump(exclude_unset=True, exclude={"id"}))
    except service.WishError as e:
        return _e(e)
    return ok()


class StatusBody(BaseModel):
    status: str = Field(pattern=r"^(active|completed|abandoned)$")


@router.post("/wishes/{wish_id}/status")
async def wish_status(wish_id: str, req: Request, user: CurrentUser = User):
    p = parse(StatusBody, await read_json(req, 1024))
    if isinstance(p, JSONResponse):
        return p
    await service.set_wish_status(user.id, wish_id, p.status)
    return ok()


class ClassifyBody(BaseModel):
    wishText: str = Field(min_length=1, max_length=500)


@router.post("/classify")
async def classify(req: Request, user: CurrentUser = User):
    if rl := limited((rules.model_ip, client_ip(req)), (rules.model_user, user.id), (rules.model_all, "all")):
        return rl
    p = parse(ClassifyBody, await read_json(req, 4096))
    if isinstance(p, JSONResponse):
        return p
    return ok(**await service.classify(p.wishText))


class QuestionsBody(BaseModel):
    wishText: str = Field(min_length=1, max_length=500)
    type: str = Field(pattern=r"^(open_ended|fixed)$")
    focus: conlist(Focus, max_length=10)
    domains: conlist(Domain, max_length=10)
    why: str | None = Field(default=None, max_length=1000)
    prior: Prior = Field(default_factory=lambda: Prior(chips=[]))


@router.post("/questions")
async def questions(req: Request, user: CurrentUser = User):
    if rl := limited((rules.model_ip, client_ip(req)), (rules.model_user, user.id), (rules.model_all, "all")):
        return rl
    p = parse(QuestionsBody, await read_json(req, 8192))
    if isinstance(p, JSONResponse):
        return p
    return ok(**await service.questions(p.model_dump()))


class RejectReason(BaseModel):
    chip: str | None = Field(default=None, max_length=60)
    text: str | None = Field(default=None, max_length=500)


class OptionsBody(BaseModel):
    step: int = Field(ge=1, le=5)
    rerollIndex: int = Field(default=0, ge=0, le=50)
    rejectedMoveIds: conlist(str, max_length=10) = Field(default_factory=list)
    rejectReason: RejectReason | None = None


@router.post("/wishes/{wish_id}/options")
async def options(wish_id: str, req: Request, user: CurrentUser = User):
    if rl := limited((rules.model_ip, client_ip(req)), (rules.model_user, user.id), (rules.model_all, "all")):
        return rl
    p = parse(OptionsBody, await read_json(req, 8192))
    if isinstance(p, JSONResponse):
        return p
    try:
        r = await service.options(user.id, wish_id, p.step, p.rerollIndex, p.rejectedMoveIds,
                                  p.rejectReason.model_dump() if p.rejectReason else None)
    except service.WishError as e:
        return _e(e)
    except LlmUnavailable as e:
        return JSONResponse({"ok": False, "reason": e.reason, "error": "Couldn't load options."}, status_code=503)
    return ok(**r)


class SelectBody(BaseModel):
    moveId: str = Uuid
    msSinceShown: int | None = Field(default=None, ge=0)
    shownMoveIds: conlist(str, max_length=30) = Field(default_factory=list)
    rejectedBefore: conlist(dict, max_length=10) = Field(default_factory=list)
    tried: conlist(str, max_length=20) = Field(default_factory=list)


@router.post("/wishes/{wish_id}/select")
async def select(wish_id: str, req: Request, user: CurrentUser = User):
    p = parse(SelectBody, await read_json(req, 16_384))
    if isinstance(p, JSONResponse):
        return p
    try:
        sm = await service.select_move(user.id, wish_id, p.moveId, p.model_dump(exclude={"moveId"}))
    except service.WishError as e:
        return _e(e)
    return ok(selectedMove=sm.model_dump(mode="json"))


@router.get("/selected-moves")
async def selected(status: str | None = None, user: CurrentUser = User):
    return ok(selectedMoves=_j(await service.list_selected(user.id, status)))


@router.get("/selected-moves/{sm_id}")
async def get_selected(sm_id: str, user: CurrentUser = User):
    from ..social import api as social_api

    sm = await service.get_selected_move(sm_id)
    if not sm or (sm.userId != user.id and not await social_api.is_accepted_buddy(user.id, sm_id)):
        return err("not found", 404)
    return ok(selectedMove=sm.model_dump(mode="json"), role="owner" if sm.userId == user.id else "buddy")


@router.post("/selected-moves/{sm_id}/abandon")
async def abandon(sm_id: str, user: CurrentUser = User):
    try:
        await service.abandon(user.id, sm_id)
    except service.WishError as e:
        return _e(e)
    return ok()


@router.get("/integrations/selected-move/{sm_id}")
async def integration(sm_id: str, user: CurrentUser = User):
    sm = await service.get_selected_move(sm_id)
    if not sm or sm.userId != user.id:
        return err("not found", 404)
    return sm.model_dump(mode="json")


def _j(x):
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(x)
