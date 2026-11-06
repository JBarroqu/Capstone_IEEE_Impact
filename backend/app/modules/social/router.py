"""Buddy routes (docs/API.md, Module 4)."""
from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ...platform.auth import CurrentUser, User
from ...platform.http import UUID_RE, err, ok, parse, read_json
from ...platform.rate_limit import limited, rules
from ...platform.security import client_ip
from . import service

router = APIRouter(prefix="/api/v1")


def _e(e: service.SocialError):
    return err(str(e), e.status)


@router.get("/users/lookup")
async def lookup(req: Request, handle: str | None = None, email: str | None = None, user: CurrentUser = User):
    if rl := limited((rules.lookup_ip, client_ip(req)), (rules.lookup_user, user.id)):
        return rl
    if not handle and not email:
        return err("Send a handle or an email.")
    return ok(users=await service.lookup(user.id, handle, email))


class InviteBody(BaseModel):
    selectedMoveId: str = Field(pattern=UUID_RE)
    buddy: str = Field(min_length=3, max_length=254)
    role: str = Field(pattern=r"^(reviewer|tester)$")
    message: str | None = Field(default=None, max_length=500)


@router.post("/invitations")
async def invite(req: Request, user: CurrentUser = User):
    if rl := limited((rules.write_ip, client_ip(req))):
        return rl
    p = parse(InviteBody, await read_json(req, 4096))
    if isinstance(p, JSONResponse):
        return p
    try:
        inv = await service.invite(user.id, p.selectedMoveId, p.buddy, p.role, p.message)
    except service.SocialError as e:
        return _e(e)
    return JSONResponse(ok(invitation=jsonable_encoder(inv)), status_code=201)


@router.get("/invitations")
async def list_invitations(box: str = "received", user: CurrentUser = User):
    if box not in ("received", "sent"):
        return err("box must be received or sent")
    return ok(invitations=jsonable_encoder(await service.list_invitations(user.id, box)))


@router.post("/invitations/{inv_id}/{action}")
async def respond(inv_id: str, action: str, req: Request, user: CurrentUser = User):
    if action == "feedback":
        return await _feedback(inv_id, req, user)
    if action not in ("accept", "decline", "revoke"):
        return err("not found", 404)
    try:
        return ok(**await service.respond(user.id, inv_id, action))
    except service.SocialError as e:
        return _e(e)


class FeedbackBody(BaseModel):
    evidenceId: str | None = Field(default=None, pattern=UUID_RE)
    rating: int | None = Field(default=None, ge=1, le=5)
    confirms: bool | None = None
    body: str = Field(default="", max_length=1000)


async def _feedback(inv_id: str, req: Request, user: CurrentUser):
    p = parse(FeedbackBody, await read_json(req, 4096))
    if isinstance(p, JSONResponse):
        return p
    try:
        return ok(**await service.submit_feedback(user.id, inv_id, p.evidenceId, p.rating, p.confirms, p.body))
    except service.SocialError as e:
        return _e(e)


@router.get("/reviews/queue")
async def queue(user: CurrentUser = User):
    return ok(queue=jsonable_encoder(await service.review_queue(user.id)))


@router.get("/selected-moves/{sm_id}/feedback")
async def move_feedback(sm_id: str, user: CurrentUser = User):
    try:
        return ok(**jsonable_encoder(await service.feedback_for_move(user.id, sm_id)))
    except service.SocialError as e:
        return _e(e)
