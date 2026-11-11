"""Module 4: Human Roles & Social Support (owner Michael Hawes). docs/modules/social.md. mike-branch's invite rules
(invite -> accept/decline, only the accepted buddy sees the work and leaves feedback, no self-invite, no re-invite),
now on a selected move (D-32) with reviewer and tester roles (D-30). A counting review becomes SocialEvidence v0.1."""
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select, update

from ... import db, policies
from ...contracts import DomainEvent, SocialEvidence
from ...platform import bus
from .tables import feedback, invitations, social_evidence

log = logging.getLogger("impact.social")


class SocialError(ValueError):
    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.status = status


def _wish():
    from ..wish import api
    return api


def _profile():
    from ..profile import api
    return api


def _growth():
    from ..growth import api
    return api


async def lookup(user_id: str, handle: str | None, email: str | None) -> list[dict]:
    search = policies.get("BUDDY_DISCOVERY") == "search"
    found = await _profile().find_user(handle=handle, email=email, search=search and bool(handle))
    return [{"handle": f["handle"], "displayName": f["displayName"]} for f in found if f["userId"] != user_id]


async def _accepted_count(c, selected_move_id: str, role: str) -> int:
    return (await c.execute(select(func.count()).select_from(invitations).where(
        invitations.c.selected_move_id == selected_move_id, invitations.c.role == role,
        invitations.c.status == "accepted"))).scalar()


async def invite(owner_id: str, selected_move_id: str, buddy_handle: str, role: str, message: str | None) -> dict:
    if role not in policies.get("BUDDY_ROLES"):
        raise SocialError(f"Role must be one of {policies.get('BUDDY_ROLES')}.")
    sm = await _wish().get_selected_move(selected_move_id)
    if not sm or sm.userId != owner_id:
        raise SocialError("Move not found.", 404)
    if sm.status in ("abandoned", "validated"):
        raise SocialError("This move is closed.", 409)
    found = await _profile().find_user(handle=buddy_handle) or await _profile().find_user(email=buddy_handle)
    if not found:
        raise SocialError("No one with that handle or email.", 404)
    buddy_id = found[0]["userId"]
    if buddy_id == owner_id:
        raise SocialError("You can't be your own buddy.")
    limit = policies.get("BUDDIES_PER_MOVE")
    async with db.tx() as c:
        if await _accepted_count(c, selected_move_id, role) >= limit:
            raise SocialError(f"This move already has its {role}.", 409)
        prev = (await c.execute(select(invitations).where(invitations.c.selected_move_id == selected_move_id,
                                                          invitations.c.buddy_id == buddy_id))).first()
        if prev:
            reopen = prev.status in ("declined", "revoked", "expired") and policies.get("REINVITE_AFTER_DECLINE")
            if not reopen:
                raise SocialError("You already invited this person to this move.", 409)
            await c.execute(update(invitations).where(invitations.c.id == prev.id).values(
                status="pending", role=role, message=message, created_at=func.now(), responded_at=None))
            inv_id = str(prev.id)
        else:
            inv_id = str((await c.execute(invitations.insert().values(
                selected_move_id=selected_move_id, owner_id=owner_id, buddy_id=buddy_id, role=role, message=message,
            ).returning(invitations.c.id))).scalar_one())
        cards = await _profile().handle_cards([owner_id])
        bus.publish(DomainEvent(name="InvitationCreated", userId=buddy_id, refs={
            "invitationId": inv_id, "selectedMoveId": selected_move_id, "role": role, "moveTitle": sm.move.title,
            "ownerName": cards.get(owner_id, {}).get("displayName", "Someone")}))
    return (await list_invitations(owner_id, "sent", only=inv_id))[0]


async def list_invitations(user_id: str, box: str, only: str | None = None) -> list[dict]:
    col = invitations.c.buddy_id if box == "received" else invitations.c.owner_id
    q = select(invitations).where(col == user_id)
    if only:
        q = q.where(invitations.c.id == only)
    async with db.read() as c:
        rows = (await c.execute(q.order_by(invitations.c.created_at.desc()))).all()
    cards = await _profile().handle_cards(list({str(r.owner_id) for r in rows} | {str(r.buddy_id) for r in rows}))
    out = []
    for r in rows:
        sm = await _wish().get_selected_move(str(r.selected_move_id))
        out.append({
            "id": str(r.id), "selectedMoveId": str(r.selected_move_id), "role": r.role, "status": r.status,
            "message": r.message, "createdAt": r.created_at, "respondedAt": r.responded_at,
            "owner": cards.get(str(r.owner_id)), "buddy": cards.get(str(r.buddy_id)),
            "move": {"title": sm.move.title, "detail": sm.move.detail, "status": sm.status, "wishText": sm.wish.text,
                     "skillId": sm.move.skillId} if sm else None,
        })
    return out


async def respond(user_id: str, invitation_id: str, action: str) -> dict:
    async with db.tx() as c:
        r = (await c.execute(select(invitations).where(invitations.c.id == invitation_id))).first()
        if not r:
            raise SocialError("Invitation not found.", 404)
        if action in ("accept", "decline"):
            if str(r.buddy_id) != user_id:
                raise SocialError("Invitation not found.", 404)
            if r.status != "pending":
                raise SocialError("This invitation was already answered.", 409)
            if action == "accept" and await _accepted_count(c, str(r.selected_move_id), r.role) >= policies.get("BUDDIES_PER_MOVE"):
                raise SocialError(f"This move already has its {r.role}.", 409)
            status = "accepted" if action == "accept" else "declined"
        elif action == "revoke":
            if str(r.owner_id) != user_id:
                raise SocialError("Invitation not found.", 404)
            if r.status not in ("pending", "accepted"):
                raise SocialError("Nothing to revoke.", 409)
            status = "revoked"
        else:
            raise SocialError("Unknown action.")
        await c.execute(update(invitations).where(invitations.c.id == invitation_id).values(status=status, responded_at=func.now()))
        if status in ("accepted", "declined"):
            sm = await _wish().get_selected_move(str(r.selected_move_id))
            cards = await _profile().handle_cards([user_id])
            bus.publish(DomainEvent(name="InvitationAccepted" if status == "accepted" else "InvitationDeclined",
                                    userId=str(r.owner_id), refs={
                                        "invitationId": invitation_id, "selectedMoveId": str(r.selected_move_id), "role": r.role,
                                        "moveTitle": sm.move.title if sm else "", "wishId": sm.wishId if sm else None,
                                        "buddyName": cards.get(user_id, {}).get("displayName", "Your buddy")}))
    return {"id": invitation_id, "status": status}


async def is_accepted_buddy(user_id: str, selected_move_id: str) -> bool:
    async with db.read() as c:
        return bool((await c.execute(select(invitations.c.id).where(
            invitations.c.selected_move_id == selected_move_id, invitations.c.buddy_id == user_id,
            invitations.c.status == "accepted"))).first())


async def review_queue(user_id: str) -> list[dict]:
    """Accepted invitations where the owner's latest evidence still needs this buddy's feedback."""
    async with db.read() as c:
        invs = (await c.execute(select(invitations).where(invitations.c.buddy_id == user_id,
                                                          invitations.c.status == "accepted"))).all()
        given = {(str(f.invitation_id), str(f.evidence_id)) for f in (await c.execute(
            select(feedback.c.invitation_id, feedback.c.evidence_id).where(feedback.c.author_id == user_id))).all()}
    out = []
    owners = await _profile().handle_cards(list({str(i.owner_id) for i in invs}))
    for i in invs:
        evs = await _growth().list_evidence(str(i.owner_id), str(i.selected_move_id))
        latest = next((e for e in evs if e["status"] not in ("withdrawn", "scoring", "ai_error")), None)
        sm = await _wish().get_selected_move(str(i.selected_move_id))
        out.append({"invitationId": str(i.id), "role": i.role, "selectedMoveId": str(i.selected_move_id),
                    "owner": owners.get(str(i.owner_id)), "move": {"title": sm.move.title, "detail": sm.move.detail} if sm else None,
                    "evidence": latest, "needsFeedback": bool(latest) and (str(i.id), latest["id"]) not in given})
    return out


async def pending_reviews(user_id: str) -> list[dict]:
    return [q for q in await review_queue(user_id) if q["needsFeedback"]]


async def submit_feedback(user_id: str, invitation_id: str, evidence_id: str | None, rating: int | None,
                          confirms: bool | None, body: str) -> dict:
    async with db.read() as c:
        inv = (await c.execute(select(invitations).where(invitations.c.id == invitation_id))).first()
    if not inv:
        raise SocialError("Invitation not found.", 404)
    if str(inv.owner_id) == user_id:
        raise SocialError("You can't review your own move.", 403)
    if str(inv.buddy_id) != user_id or inv.status != "accepted":
        raise SocialError("Only the accepted buddy can leave feedback.", 403)
    evs = await _growth().list_evidence(str(inv.owner_id), str(inv.selected_move_id))
    target = next((e for e in evs if e["id"] == evidence_id), None) if evidence_id else (evs[0] if evs else None)
    if inv.role == "reviewer":
        if not target:
            raise SocialError("There's no evidence to review yet.", 409)
        if rating is None or confirms is None:
            raise SocialError("A reviewer gives a 1 to 5 rating and confirms or not.")
    elif not body.strip():
        raise SocialError("Write what you found when you tried it.")
    counts = inv.role == "reviewer" or (inv.role == "tester" and policies.get("TESTER_COUNTS") and rating is not None)
    sm = await _wish().get_selected_move(str(inv.selected_move_id))
    se_contract = None
    async with db.tx() as c:
        if target and (await c.execute(select(feedback.c.id).where(feedback.c.invitation_id == invitation_id,
                                                                   feedback.c.evidence_id == target["id"]))).first():
            raise SocialError("You already reviewed this evidence.", 409)
        fb_id = str((await c.execute(feedback.insert().values(
            invitation_id=invitation_id, author_id=user_id, evidence_id=target["id"] if target else None, rating=rating,
            confirms=confirms, body=body.strip()).returning(feedback.c.id))).scalar_one())
        if target:
            tier = await _growth().reviewer_tier(user_id, sm.move.careerId if sm else None)
            se = SocialEvidence(id=fb_id, invitationId=invitation_id, evidenceId=target["id"], selectedMoveId=str(inv.selected_move_id),
                                ownerId=str(inv.owner_id), reviewerId=user_id, reviewerRole=inv.role, reviewerTier=tier,
                                rating=rating, confirmed=confirms, comment=body.strip()[:1000], countsTowardPoints=bool(counts),
                                createdAt=datetime.now(timezone.utc))
            await c.execute(social_evidence.insert().values(
                id=fb_id, feedback_id=fb_id, evidence_id=target["id"], reviewer_id=user_id, reviewer_role=inv.role,
                reviewer_tier=tier, rating=rating, confirmed=confirms, counts_toward_points=bool(counts),
                contract=se.model_dump(mode="json")))
            se_contract = se
        cards = await _profile().handle_cards([user_id])
        bus.publish(DomainEvent(name="FeedbackSubmitted", userId=str(inv.owner_id), refs={
            "invitationId": invitation_id, "evidenceId": target["id"] if target else None, "socialEvidenceId": fb_id if target else None,
            "comment": body.strip(), "buddyName": cards.get(user_id, {}).get("displayName", "Your buddy")}))
    if se_contract:
        await _growth().apply_social_evidence(se_contract)
        await _growth().award_reviewer_effort(user_id, se_contract.evidenceId)
    return {"id": fb_id, "socialEvidence": se_contract.model_dump(mode="json") if se_contract else None}


async def feedback_for_move(user_id: str, selected_move_id: str) -> list[dict]:
    sm = await _wish().get_selected_move(selected_move_id)
    if not sm or (sm.userId != user_id and not await is_accepted_buddy(user_id, selected_move_id)):
        raise SocialError("not found", 404)
    async with db.read() as c:
        rows = (await c.execute(select(feedback, invitations.c.role).join(invitations, invitations.c.id == feedback.c.invitation_id)
                                .where(invitations.c.selected_move_id == selected_move_id).order_by(feedback.c.created_at))).all()
        invs = (await c.execute(select(invitations).where(invitations.c.selected_move_id == selected_move_id,
                                                          invitations.c.status.in_(("pending", "accepted"))))).all()
    cards = await _profile().handle_cards(list({str(r.author_id) for r in rows} | {str(i.buddy_id) for i in invs}))
    return {
        "feedback": [{"id": str(r.id), "role": r.role, "rating": r.rating, "confirms": r.confirms, "body": r.body,
                      "evidenceId": str(r.evidence_id) if r.evidence_id else None, "author": cards.get(str(r.author_id)),
                      "createdAt": r.created_at} for r in rows],
        "buddies": [{"invitationId": str(i.id), "role": i.role, "status": i.status, "buddy": cards.get(str(i.buddy_id))} for i in invs],
    }


async def counting_reviews(evidence_ids: list[str]) -> dict[str, list[tuple]]:
    if not evidence_ids:
        return {}
    async with db.read() as c:
        rows = (await c.execute(select(social_evidence).where(social_evidence.c.evidence_id.in_(evidence_ids),
                                                              social_evidence.c.counts_toward_points.is_(True)))).all()
    out: dict[str, list[tuple]] = {}
    for r in rows:
        out.setdefault(str(r.evidence_id), []).append((r.reviewer_tier, r.rating, r.confirmed, r.contract.get("comment")))
    return out


async def has_buddy(selected_move_id: str) -> bool:
    async with db.read() as c:
        return bool((await c.execute(select(invitations.c.id).where(
            invitations.c.selected_move_id == selected_move_id, invitations.c.status.in_(("pending", "accepted"))))).first())
