"""Platform routes: health, public config, current user."""
from fastapi import APIRouter

from .. import policies
from ..config import config
from .auth import CurrentUser, User
from .http import ok

router = APIRouter(prefix="/api/v1")


def model_services() -> list[str]:
    from ..llm.backends import remote_services

    return remote_services()


@router.get("/health")
async def health():
    return {"ok": True}


@router.get("/config")
async def get_config():
    """What the browser needs before sign-in: public policy values (to word the UI), auth settings, privacy note."""
    services = model_services()
    return ok(
        policies=policies.public(),
        appVersion=config.app_version,
        modelServices=services,
        privacy=(
            "What you type in your profile, wishes and evidence summaries is sent to an outside model service "
            f"({', '.join(services)}) to write your moves and score your evidence. Your name and email are not sent."
            if services else "Nothing you type leaves this server."),
    )


@router.get("/me")
async def me(user: CurrentUser = User):
    from ..modules.profile import api as profile_api

    state = await profile_api.get_professional_state(user.id)
    return ok(userId=user.id, email=user.email, onboarded=state.onboardingCompletedAt is not None, handle=state.handle,
              displayName=state.displayName)
