"""Profile routes (docs/API.md, Module 1)."""
from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ... import policies
from ...contracts import ProfessionalState
from ...platform.auth import CurrentUser, User
from ...platform.http import err, ok, parse, read_json
from ...platform.rate_limit import limited, rules
from ...platform.security import client_ip
from . import resume, service

router = APIRouter(prefix="/api/v1")


class ProfileIn(ProfessionalState):
    userId: str = ""
    completeOnboarding: bool = False


@router.get("/profile")
async def get_profile(user: CurrentUser = User):
    return ok(profile=(await service.get_state(user.id)).model_dump(mode="json"))


@router.put("/profile")
async def put_profile(req: Request, user: CurrentUser = User):
    p = parse(ProfileIn, await read_json(req, 32_768))
    if isinstance(p, JSONResponse):
        return p
    try:
        state = await service.save(user.id, p, p.completeOnboarding)
    except service.ProfileError as e:
        return err(str(e))
    return ok(profile=state.model_dump(mode="json"))


@router.get("/profile/handle-available")
async def handle_available(h: str, user: CurrentUser = User):
    h = h.strip().lower()
    import re

    if not re.fullmatch(r"[a-z0-9_]{3,24}", h):
        return ok(available=False, reason="3 to 24 lowercase letters, digits or _")
    return ok(available=await service.handle_available(h, user.id))


@router.post("/profile/import")
async def start_import(req: Request, file: UploadFile = File(...), user: CurrentUser = User):
    if policies.get("PROFILE_IMPORT") != "on":
        return err("Resume import is switched off.", 403)
    if rl := limited((rules.resume_ip, client_ip(req)), (rules.resume_user, user.id), (rules.resume_all, "all")):
        return rl
    cap = policies.get("RESUME_MAX_MB") * 1024 * 1024
    data = await file.read(cap + 1)
    if len(data) > cap:
        return err(f"The file is larger than {policies.get('RESUME_MAX_MB')} MB.", 413)
    try:
        import_id = await resume.start_import(user.id, data, file.filename or "resume")
    except ValueError as e:
        return err(str(e))
    return JSONResponse(ok(importId=import_id), status_code=202)


@router.get("/profile/import/{import_id}")
async def get_import(import_id: str, user: CurrentUser = User):
    r = await resume.get_import(user.id, import_id)
    return ok(**r) if r else err("not found", 404)


class StatusIn(BaseModel):
    status: str


@router.post("/profile/import/{import_id}/discard")
async def discard(import_id: str, user: CurrentUser = User):
    await resume.set_status(user.id, import_id, "discarded")
    return ok()


@router.post("/profile/import/{import_id}/applied")
async def applied(import_id: str, user: CurrentUser = User):
    await resume.set_status(user.id, import_id, "applied")
    return ok()


@router.get("/integrations/professional-state")
async def integration(user: CurrentUser = User):
    return (await service.get_state(user.id)).model_dump(mode="json")
