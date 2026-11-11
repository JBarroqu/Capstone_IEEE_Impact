"""Module 1: Professional State (owner Cfoley5). docs/modules/profile.md. Fields from the Professional-State branch plus
strengths, target career and handle (D-44, D-51). Only the server marks a contribution verified (D-44, D-45)."""
from datetime import datetime, timezone

from sqlalchemy import and_, delete, func, select, update

from ... import db, policies
from ...contracts import Contribution, DomainEvent, Education, ProfessionalState
from ...platform import bus
from ..growth import api as growth_api
from .tables import contributions, profiles


class ProfileError(ValueError):
    pass


def _row_to_state(p, contribs) -> ProfessionalState:
    edu = p.education or {}
    return ProfessionalState(
        userId=str(p.user_id), handle=p.handle, displayName=p.display_name, headline=p.headline, bio=p.bio,
        education=Education(institution=edu.get("institution", ""), major=edu.get("major", ""), gradYear=edu.get("gradYear")),
        position=p.position, targetCareerId=p.target_career_id, skills=list(p.skills or []),
        interests=list(p.interests or []), strengths=list(p.strengths or []), growthAreas=list(p.growth_areas or []),
        featuredContributions=[Contribution(id=str(c.id), title=c.title, type=c.type, description=c.description,
                                            verificationStatus=c.verification_status,
                                            evidenceId=str(c.evidence_id) if c.evidence_id else None) for c in contribs],
        onboardingCompletedAt=p.onboarding_completed_at, version=p.version, updatedAt=p.updated_at,
    )


async def get_state(user_id: str) -> ProfessionalState:
    async with db.read() as c:
        p = (await c.execute(select(profiles).where(profiles.c.user_id == user_id))).first()
        if p is None:
            raise ProfileError("profile not found")
        cs = (await c.execute(select(contributions).where(contributions.c.user_id == user_id)
                              .order_by(contributions.c.position))).all()
    return _row_to_state(p, cs)


async def handle_available(handle: str, user_id: str | None = None) -> bool:
    async with db.read() as c:
        row = (await c.execute(select(profiles.c.user_id).where(func.lower(profiles.c.handle) == handle.lower()))).first()
    return row is None or (user_id is not None and str(row[0]) == user_id)


def _clean_list(xs: list[str]) -> list[str]:
    return list(dict.fromkeys(x.strip() for x in xs if x and x.strip()))


async def save(user_id: str, body: ProfessionalState, complete_onboarding: bool) -> ProfessionalState:
    handle = (body.handle or "").strip().lower() or None
    if handle and not await handle_available(handle, user_id):
        raise ProfileError("That handle is taken.")
    if body.targetCareerId and not growth_api.career_exists(body.targetCareerId):
        raise ProfileError("Unknown target career.")
    if complete_onboarding:
        if policies.get("HANDLE_REQUIRED") and not handle:
            raise ProfileError("Choose a handle so buddies can invite you.")
        if policies.get("SKILL_MODEL") == "taxonomy" and not body.targetCareerId:
            raise ProfileError("Choose a target career.")
        if not body.displayName.strip():
            raise ProfileError("Add your name.")

    # Only the server sets "verified": keep it only where the linked evidence is really validated (D-44).
    contribs = []
    for i, ctb in enumerate(body.featuredContributions):
        verified = bool(ctb.evidenceId) and await growth_api.is_validated_evidence(user_id, ctb.evidenceId)
        contribs.append({"user_id": user_id, "title": ctb.title.strip(), "type": ctb.type, "description": ctb.description,
                         "verification_status": "verified" if verified else "self_reported",
                         "evidence_id": ctb.evidenceId if verified else None, "position": i})

    async with db.tx() as c:
        cur = (await c.execute(select(profiles.c.onboarding_completed_at).where(profiles.c.user_id == user_id))).first()
        if cur is None:
            raise ProfileError("profile not found")
        first_completion = complete_onboarding and cur.onboarding_completed_at is None
        values = {
            "handle": handle, "display_name": body.displayName.strip(), "headline": body.headline.strip(),
            "bio": body.bio.strip(), "education": body.education.model_dump(), "position": body.position.strip(),
            "target_career_id": body.targetCareerId, "skills": _clean_list(body.skills),
            "interests": _clean_list(body.interests), "strengths": _clean_list(body.strengths),
            "growth_areas": _clean_list(body.growthAreas), "version": profiles.c.version + 1, "updated_at": func.now(),
        }
        if first_completion:
            values["onboarding_completed_at"] = func.now()
        await c.execute(update(profiles).where(profiles.c.user_id == user_id).values(**values))
        await c.execute(delete(contributions).where(contributions.c.user_id == user_id))
        if contribs:
            await c.execute(contributions.insert().values(contribs))
        if first_completion:
            bus.publish(DomainEvent(name="ProfileUpdated", userId=user_id, refs={"completed": True}))
    return await get_state(user_id)


async def evidence_on_profile(user_id: str, evidence_ids: list[str]) -> set[str]:
    if not evidence_ids:
        return set()
    async with db.read() as c:
        rows = (await c.execute(select(contributions.c.evidence_id).where(and_(
            contributions.c.user_id == user_id, contributions.c.evidence_id.in_(evidence_ids))))).scalars()
    return {str(r) for r in rows}


async def add_verified_contribution(user_id: str, evidence_id: str, title: str, description: str) -> None:
    async with db.tx() as c:
        exists = (await c.execute(select(contributions.c.id).where(and_(contributions.c.user_id == user_id,
                                                                         contributions.c.evidence_id == evidence_id)))).first()
        if exists:
            return
        n = (await c.execute(select(func.count()).select_from(contributions).where(contributions.c.user_id == user_id))).scalar()
        if n >= 10:
            return
        await c.execute(contributions.insert().values(user_id=user_id, title=title[:120], type="project",
                                                      description=description[:1000], verification_status="verified",
                                                      evidence_id=evidence_id, position=n))


async def touch_seen(user_id: str) -> tuple[datetime | None, datetime | None]:
    """Home was opened: previous_seen <- last_seen, last_seen <- now (While You Were Away, D-39)."""
    async with db.tx() as c:
        row = (await c.execute(select(profiles.c.last_seen_at).where(profiles.c.user_id == user_id))).first()
        last = row.last_seen_at if row else None
        now = datetime.now(timezone.utc)
        # Re-opening Home within 30 minutes is the same visit.
        if last and (now - last).total_seconds() < 1800:
            prev = (await c.execute(select(profiles.c.previous_seen_at).where(profiles.c.user_id == user_id))).scalar()
            return prev, last
        await c.execute(update(profiles).where(profiles.c.user_id == user_id).values(previous_seen_at=last, last_seen_at=now))
    return last, now
