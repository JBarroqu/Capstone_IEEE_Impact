"""Growth routes (docs/API.md, Module 3)."""
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from ...platform.auth import CurrentUser, User
from ...platform.http import err, ok
from ...platform.rate_limit import limited, rules
from ...platform.security import client_ip
from . import catalog, service

router = APIRouter(prefix="/api/v1")


@router.get("/catalog")
async def get_catalog():
    return ok(**catalog.public())


@router.get("/growth")
async def get_growth(user: CurrentUser = User):
    return ok(growth=(await service.growth_state(user.id)).model_dump(mode="json"))


@router.get("/integrations/growth-state")
async def integration(user: CurrentUser = User):
    return (await service.growth_state(user.id)).model_dump(mode="json")


@router.post("/evidence")
async def submit(req: Request, selectedMoveId: str = Form(...), artifactType: str = Form(...), summary: str = Form(...),
                 url: str | None = Form(None), revisionOf: str | None = Form(None), skillId: str | None = Form(None),
                 activityType: str | None = Form(None), difficulty: str | None = Form(None),
                 file: UploadFile | None = File(None), user: CurrentUser = User):
    if rl := limited((rules.evidence_ip, client_ip(req)), (rules.evidence_user, user.id), (rules.evidence_all, "all")):
        return rl
    f = None
    if file is not None and file.filename:
        data = await file.read(service.MAX_FILE + 1)
        f = (file.filename, data)
    try:
        ev = await service.submit(user.id, selectedMoveId, artifactType, summary, url, f,
                                  {"skillId": skillId, "activityType": activityType, "difficulty": difficulty}, revisionOf)
    except service.GrowthError as e:
        return err(str(e), e.status)
    return JSONResponse(ok(evidence=_json(ev)), status_code=202)


@router.get("/evidence")
async def list_evidence(selectedMoveId: str | None = None, user: CurrentUser = User):
    return ok(evidence=[_json(e) for e in await service.list_evidence(user.id, selectedMoveId)])


@router.get("/evidence/{evidence_id}")
async def get_evidence(evidence_id: str, user: CurrentUser = User):
    from ..social import api as social_api

    own = await service.get_evidence(user.id, evidence_id)
    if own:
        return ok(evidence=_json(own), role="owner")
    owner = await service.owner_of(evidence_id)
    if owner and await social_api.is_accepted_buddy(user.id, owner[1]):
        return ok(evidence=_json(await service.get_evidence(user.id, evidence_id, viewer_is_buddy=True)), role="buddy")
    return err("not found", 404)


@router.post("/evidence/{evidence_id}/retry-scoring")
async def retry(evidence_id: str, user: CurrentUser = User):
    try:
        return ok(evidence=_json(await service.retry_scoring(user.id, evidence_id)))
    except service.GrowthError as e:
        return err(str(e), e.status)


@router.get("/evidence/{evidence_id}/file-url")
async def file_url(evidence_id: str, user: CurrentUser = User):
    from ..social import api as social_api

    owner = await service.owner_of(evidence_id)
    if not owner:
        return err("not found", 404)
    if owner[0] != user.id and not await social_api.is_accepted_buddy(user.id, owner[1]):
        return err("not found", 404)
    url = await service.file_url(evidence_id)
    return ok(url=url) if url else err("no file", 404)


@router.get("/score-events")
async def score_events(user: CurrentUser = User):
    return ok(events=[_json(e) for e in await service.ledger(user.id)])


def _json(d: dict) -> dict:
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(d)
