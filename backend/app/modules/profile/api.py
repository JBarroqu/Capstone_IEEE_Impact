"""The only functions other modules may call in Module 1 (import-linter enforces this). Returns contracts."""
from sqlalchemy import func, select, text

from ... import db
from ...contracts import ProfessionalState
from . import service
from .tables import profiles


async def get_professional_state(user_id: str) -> ProfessionalState:
    return await service.get_state(user_id)


def to_prompt_profile(state: ProfessionalState, mode: str, career_name: str | None = None) -> dict | None:
    """D-06: what the move generator sees. summary never includes name, bio or school; off returns None."""
    if mode == "off":
        return None
    out = {
        "targetCareer": career_name or state.targetCareerId, "major": state.education.major, "position": state.position,
        "skills": state.skills, "interests": state.interests, "strengths": state.strengths, "growthAreas": state.growthAreas,
    }
    if mode == "full":
        out |= {"headline": state.headline, "bio": state.bio,
                "contributions": [f"{c.title}: {c.description}" for c in state.featuredContributions]}
    return {k: v for k, v in out.items() if v}


async def handle_cards(user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    async with db.read() as c:
        rows = (await c.execute(select(profiles.c.user_id, profiles.c.handle, profiles.c.display_name)
                                .where(profiles.c.user_id.in_(user_ids)))).all()
    return {str(r.user_id): {"handle": r.handle, "displayName": r.display_name or (r.handle or "")} for r in rows}


async def is_onboarded(user_id: str) -> bool:
    async with db.read() as c:
        v = (await c.execute(select(profiles.c.onboarding_completed_at).where(profiles.c.user_id == user_id))).scalar()
    return v is not None


async def find_user(handle: str | None = None, email: str | None = None, prefix: bool = False) -> list[dict]:
    """Buddy lookup (D-35): exact handle or exact email; prefix search only when BUDDY_DISCOVERY=prefix."""
    async with db.read() as c:
        if handle:
            h = handle.strip().lower().lstrip("@")
            cond = profiles.c.handle.ilike(f"{h.replace('%', '').replace('_', r'\_')}%") if prefix else func.lower(profiles.c.handle) == h
            rows = (await c.execute(select(profiles.c.user_id, profiles.c.handle, profiles.c.display_name)
                                    .where(cond, profiles.c.handle.is_not(None)).limit(10))).all()
        elif email:
            rows = (await c.execute(text(
                "select p.user_id, p.handle, p.display_name from auth.users u join profile.profiles p on p.user_id = u.id "
                "where lower(u.email) = lower(:e) and p.handle is not null"), {"e": email.strip()})).all()
        else:
            rows = []
    return [{"userId": str(r.user_id), "handle": r.handle, "displayName": r.display_name or r.handle} for r in rows]


async def touch_seen(user_id: str):
    return await service.touch_seen(user_id)


async def add_verified_contribution(user_id: str, evidence_id: str, title: str, description: str) -> None:
    await service.add_verified_contribution(user_id, evidence_id, title, description)
