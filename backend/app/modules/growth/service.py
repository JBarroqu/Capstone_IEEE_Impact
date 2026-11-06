"""Module 3: Activity, Evidence & Growth (owner Christina Phan). docs/modules/growth.md, docs/SCORING.md.
Evidence always belongs to a SelectedMove from Module 2; its skill, activity type and difficulty come from the move
(D-11). The rubric scores first; ValidationStrategy (D-13) decides whether that is pending, final, or nothing until a
buddy reviews. Points are an append-only ledger with the rules version and policy snapshot on every row."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert

from ... import db, policies
from ...contracts import DomainEvent, GrowthState, Outcome, SocialEvidence
from ...llm.errors import LlmUnavailable
from ...platform import bus, jobs, storage
from ...platform.textextract import DOCX, PDF, TXT, extract_text, sniff
from . import catalog, rubric, scoring
from .tables import endorsements, evidence, score_events, unlocks

log = logging.getLogger("impact.growth")
MAX_FILE = 10 * 1024 * 1024
ALLOWED_FILES = {PDF: "pdf", DOCX: "docx", TXT: "txt", "image/png": "png", "image/jpeg": "jpg"}


class GrowthError(ValueError):
    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.status = status


def _wish():
    from ..wish import api
    return api


def _social():
    from ..social import api
    return api


def _profile():
    from ..profile import api
    return api


def _ev_dict(r) -> dict:
    return {k: (float(v) if k in ("ai_score", "ai_confidence", "final_quality") and v is not None else v)
            for k, v in r._mapping.items()} | {"id": str(r.id), "selected_move_id": str(r.selected_move_id)}


# ---- reading ----------------------------------------------------------------------------------------------------
async def _load(user_id: str):
    async with db.read() as c:
        ledger = [dict(r._mapping) | {"evidence_id": str(r.evidence_id) if r.evidence_id else None}
                  for r in (await c.execute(select(score_events).where(score_events.c.user_id == user_id))).all()]
        evs = [_ev_dict(r) for r in (await c.execute(select(evidence).where(evidence.c.user_id == user_id)
                                                      .order_by(evidence.c.created_at.desc()))).all()]
        ends = (await c.execute(select(endorsements.c.skill_id, endorsements.c.tier).where(endorsements.c.user_id == user_id))).all()
        unl = {r.opportunity_id: r.unlocked_at for r in (await c.execute(select(unlocks).where(unlocks.c.user_id == user_id))).all()}
    return ledger, evs, ends, unl


async def _inputs(user_id: str) -> scoring.GrowthInputs:
    state = await _profile().get_professional_state(user_id)
    ledger, evs, ends, unl = await _load(user_id)
    reviews = await _social().counting_reviews([e["id"] for e in evs])
    senior = {eid: any(t in policies.scoring_rules().senior_reviewer_tiers for t, _, _, _ in rs) for eid, rs in reviews.items()}
    taxonomy = policies.get("SKILL_MODEL") == "taxonomy"
    outcomes = []
    for e in [e for e in evs if e["status"] in ("validated", "needs_work", "awaiting_review")][:5]:
        pts = sum(float(r["points"]) for r in ledger if r["evidence_id"] == e["id"] and r["kind"] == "validated")
        rv = reviews.get(e["id"]) or []
        outcomes.append(Outcome(evidenceId=e["id"], selectedMoveId=e["selected_move_id"], skillId=e["skill_id"],
                                status=e["status"], aiScore=e["ai_score"], finalQuality=e["final_quality"],
                                points=pts if e["status"] == "validated" else None,
                                feedbackSummary=(e["ai_feedback"] or "")[:240] or None,
                                buddyComment=(rv[0][3] or None) if rv else None, peerConfirmed=e["peer_confirmed"]).model_dump())
    return scoring.GrowthInputs(
        user_id=user_id, career=catalog.career(state.targetCareerId) if taxonomy else None,
        freeform_skills=[] if taxonomy else state.skills, ledger=ledger, evidence=evs, senior_by_evidence=senior,
        endorsed_skills={s for s, t in ends if t == "Verified"}, unlocked=unl, opportunities=catalog.opportunities(),
        outcomes=outcomes,
    )


async def growth_state(user_id: str) -> GrowthState:
    inp = await _inputs(user_id)
    body = scoring.compute(inp, policies.scoring_rules(), provisional_counts=policies.get("PROVISIONAL_COUNTS"),
                           verified_requires=policies.get("VERIFIED_REQUIRES"), unlock_match=policies.unlock_match())
    return GrowthState(userId=user_id, catalogVersion=catalog.version(), **body)


async def list_evidence(user_id: str, selected_move_id: str | None = None) -> list[dict]:
    q = select(evidence).where(evidence.c.user_id == user_id)
    if selected_move_id:
        q = q.where(evidence.c.selected_move_id == selected_move_id)
    async with db.read() as c:
        rows = (await c.execute(q.order_by(evidence.c.created_at.desc()))).all()
    return [public_evidence(_ev_dict(r)) for r in rows]


def public_evidence(e: dict, points: float | None = None) -> dict:
    return {
        "id": e["id"], "selectedMoveId": e["selected_move_id"], "revisionOf": str(e["revision_of"]) if e.get("revision_of") else None,
        "skillId": e["skill_id"], "activityType": e["activity_type"], "difficulty": e["difficulty"],
        "difficultyFinal": e["difficulty_final"], "artifactType": e["artifact_type"], "artifactUrl": e["artifact_url"],
        "fileName": e["file_name"], "hasFile": bool(e["storage_path"]), "summary": e["summary"], "status": e["status"],
        "aiScore": e["ai_score"], "aiConfidence": e["ai_confidence"], "aiFeedback": e["ai_feedback"],
        "aiCriteria": {k: v for k, v in (e["ai_criteria"] or {}).items() if k in rubric.CRITERIA},
        "finalQuality": e["final_quality"], "peerConfirmed": e["peer_confirmed"], "rulesVersion": e["rules_version"],
        "createdAt": e["created_at"], "finalizedAt": e["finalized_at"], "points": points,
    }


async def get_evidence(user_id: str, evidence_id: str, viewer_is_buddy: bool = False) -> dict | None:
    async with db.read() as c:
        r = (await c.execute(select(evidence).where(evidence.c.id == evidence_id))).first()
        if not r:
            return None
        pts = (await c.execute(select(func.coalesce(func.sum(score_events.c.points), 0)).where(
            score_events.c.evidence_id == evidence_id, score_events.c.kind == "validated"))).scalar()
        pend = (await c.execute(select(func.coalesce(func.sum(score_events.c.points), 0)).where(
            score_events.c.evidence_id == evidence_id, score_events.c.kind == "provisional"))).scalar()
    e = _ev_dict(r)
    if str(r.user_id) != user_id and not viewer_is_buddy:
        return None
    out = public_evidence(e, float(pts) if e["status"] == "validated" else None)
    out["pendingPoints"] = float(pend) if e["status"] == "awaiting_review" else None
    out["ownerId"] = str(r.user_id)
    return out


async def owner_of(evidence_id: str) -> tuple[str, str] | None:
    async with db.read() as c:
        r = (await c.execute(select(evidence.c.user_id, evidence.c.selected_move_id).where(evidence.c.id == evidence_id))).first()
    return (str(r.user_id), str(r.selected_move_id)) if r else None


async def file_url(evidence_id: str) -> str | None:
    async with db.read() as c:
        path = (await c.execute(select(evidence.c.storage_path).where(evidence.c.id == evidence_id))).scalar()
    return await storage.signed_url("evidence", path) if path else None


async def ledger(user_id: str) -> list[dict]:
    async with db.read() as c:
        rows = (await c.execute(select(score_events).where(score_events.c.user_id == user_id)
                                .order_by(score_events.c.created_at.desc()).limit(200))).all()
    return [{"id": str(r.id), "kind": r.kind, "points": float(r.points), "skillId": r.skill_id, "reason": r.reason_code,
             "evidenceId": str(r.evidence_id) if r.evidence_id else None, "rulesVersion": r.rules_version,
             "createdAt": r.created_at} for r in rows]


# ---- submitting -------------------------------------------------------------------------------------------------
async def submit(user_id: str, selected_move_id: str, artifact_type: str, summary: str, url: str | None,
                 file: tuple[str, bytes] | None, user_tags: dict | None = None, revision_of: str | None = None) -> dict:
    sm = await _wish().get_selected_move(selected_move_id)
    if not sm or sm.userId != user_id:
        raise GrowthError("Move not found.", 404)
    if sm.status not in ("active", "needs_work", "evidence_submitted"):
        raise GrowthError("This move already has evidence under review or validated.", 409)
    if artifact_type not in ("link", "file", "text"):
        raise GrowthError("artifactType must be link, file or text.")
    if not summary.strip() or len(summary) > 4000:
        raise GrowthError("Add a summary (up to 4,000 characters).")
    if artifact_type == "link" and not (url or "").startswith(("https://", "http://")):
        raise GrowthError("Add a link starting with https://.")

    skill_id, activity, difficulty = sm.move.skillId, sm.move.activityType, sm.move.difficulty
    if policies.get("MOVE_TAGS_SOURCE") == "user" and user_tags:
        skill_id = user_tags.get("skillId") or skill_id
        activity = user_tags.get("activityType") if user_tags.get("activityType") in rubric_types() else activity
        difficulty = user_tags.get("difficulty") if user_tags.get("difficulty") in ("easy", "moderate", "hard") else difficulty

    file_text, mime, fname = "", None, None
    if artifact_type == "file":
        if not file:
            raise GrowthError("Attach a file.")
        fname, data = file
        if len(data) > MAX_FILE:
            raise GrowthError("The file is larger than 10 MB.", 413)
        mime = sniff(data)
        if mime not in ALLOWED_FILES:
            raise GrowthError("Upload a PDF, Word, text, PNG or JPEG file.")
        file_text = extract_text(data, mime)

    await _wish().set_selected_move_status(selected_move_id, "evidence_submitted")
    async with db.tx() as c:
        ev_id = (await c.execute(evidence.insert().values(
            user_id=user_id, selected_move_id=selected_move_id, revision_of=revision_of, skill_id=skill_id,
            activity_type=activity, difficulty=difficulty, artifact_type=artifact_type,
            artifact_url=url if artifact_type == "link" else None, file_name=(fname or "")[:200] or None, file_mime=mime,
            summary=summary.strip(), status="scoring", rules_version=policies.scoring_rules().version,
        ).returning(evidence.c.id))).scalar_one()
        ev_id = str(ev_id)
        bus.publish(DomainEvent(name="EvidenceSubmitted", userId=user_id,
                                refs={"evidenceId": ev_id, "selectedMoveId": selected_move_id, "wishId": sm.wishId}))
    if file:
        path = f"{user_id}/{ev_id}/{ALLOWED_FILES[mime]}"
        try:
            await storage.upload("evidence", path, file[1], mime)
            async with db.tx() as c:
                await c.execute(update(evidence).where(evidence.c.id == ev_id).values(storage_path=path))
        except storage.StorageError:
            log.exception("evidence upload failed for %s", ev_id)
    rubric_text = summary.strip() + (f"\n\nExtracted file text:\n{file_text}" if file_text else "")
    jobs.enqueue(f"rubric:{ev_id}", lambda: run_scoring(ev_id, rubric_text))
    return (await get_evidence(user_id, ev_id)) or {"id": ev_id}


def rubric_types() -> tuple:
    return ("explore", "create", "test", "share", "connect", "enable")


async def retry_scoring(user_id: str, evidence_id: str) -> dict:
    async with db.tx() as c:
        r = (await c.execute(select(evidence).where(evidence.c.id == evidence_id, evidence.c.user_id == user_id))).first()
        if not r:
            raise GrowthError("Not found.", 404)
        if r.status != "ai_error":
            raise GrowthError("Only evidence whose scoring failed can be retried.", 409)
        await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(status="scoring"))
    jobs.enqueue(f"rubric:{evidence_id}", lambda: run_scoring(evidence_id, r.summary))
    return await get_evidence(user_id, evidence_id)


# ---- scoring and finalising -------------------------------------------------------------------------------------
async def run_scoring(evidence_id: str, text: str) -> None:
    async with db.read() as c:
        r = (await c.execute(select(evidence).where(evidence.c.id == evidence_id))).first()
    if not r or r.status != "scoring":
        return
    e = _ev_dict(r)
    sm = await _wish().get_selected_move(e["selected_move_id"])
    skill_name = _skill_name(sm.move.careerId if sm else None, e["skill_id"])
    try:
        res = await rubric.score(skill_name, sm.move.title if sm else "", e["artifact_type"], e["artifact_url"], text)
    except (LlmUnavailable, Exception) as ex:
        log.warning("rubric failed for %s: %s", evidence_id, ex)
        async with db.tx() as c:
            await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(status="ai_error"))
        return
    out = res.value
    rules = policies.scoring_rules()
    diff_final = scoring.adjust_difficulty(e["difficulty"], out["suggested_difficulty"], policies.get("AI_DIFFICULTY_ADJUST") == "one_level")
    strategy = policies.validation()
    snapshot = policies.snapshot()
    action = strategy.after_rubric()
    if action in ("provisional", "wait"):
        await _wish().set_selected_move_status(e["selected_move_id"], "awaiting_review")
    async with db.tx() as c:
        await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(
            ai_score=out["score"], ai_confidence=out["confidence"], ai_feedback=out["feedback"], ai_criteria=out["criteria"],
            ai_provider=res.backend.provider, ai_model=res.backend.model, rubric_version=rubric.RUBRIC_VERSION,
            difficulty_final=diff_final, status="ai_scored"))
        await _award_effort(c, e["user_id"], e["selected_move_id"], evidence_id, e["skill_id"], rules, snapshot)
        provisional = None
        if action == "provisional":
            all_ev = (await _load(str(e["user_id"])))[1]
            n = scoring.recent_count(all_ev, e["skill_id"], e["activity_type"], evidence_id, rules)
            provisional = scoring.points(e["activity_type"], diff_final, out["score"], n, rules, policies.get("DECAY_ENABLED")) \
                if out["score"] >= rules.pass_bar else 0.0
            await c.execute(insert(score_events).values(
                user_id=e["user_id"], kind="provisional", points=provisional, evidence_id=evidence_id,
                selected_move_id=e["selected_move_id"], skill_id=e["skill_id"], reason_code="rubric_pending",
                rules_version=rules.version, policy_snapshot=snapshot).on_conflict_do_nothing())
        if action in ("provisional", "wait"):
            await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(status="awaiting_review"))
        bus.publish(DomainEvent(name="EvidenceScored", userId=str(e["user_id"]), refs={
            "evidenceId": evidence_id, "selectedMoveId": e["selected_move_id"], "aiScore": out["score"],
            "provisional": action == "provisional", "points": provisional, "skillId": e["skill_id"], "skillName": skill_name,
            "wishId": sm.wishId if sm else None}))
    if action == "final":
        await finalize(evidence_id, reviewer=None, peer_confirmed=None)


async def _award_effort(c, user_id, selected_move_id, evidence_id, skill_id, rules, snapshot, reason="move_done") -> None:
    """Effort points: once per selected move (D-21) or per submission, capped at 20 per ISO week (D-20)."""
    once = policies.effort_rule().once_per_move()
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.isoweekday() - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    used = (await c.execute(select(func.coalesce(func.sum(score_events.c.points), 0)).where(
        score_events.c.user_id == user_id, score_events.c.kind == "effort", score_events.c.created_at >= week_start))).scalar()
    allowed = scoring.effort_allowed(rules.effort_points, float(used), rules)
    if not allowed:
        return
    await c.execute(insert(score_events).values(
        user_id=user_id, kind="effort", points=allowed, evidence_id=evidence_id,
        selected_move_id=selected_move_id if once and selected_move_id else None, skill_id=skill_id,
        reason_code=reason, rules_version=rules.version, policy_snapshot=snapshot).on_conflict_do_nothing())


async def finalize(evidence_id: str, reviewer: tuple[str, int] | None, peer_confirmed: bool | None,
                   force_needs_work: bool = False) -> None:
    """Final quality -> validated points or needs work; then tiers, unlocks and events."""
    async with db.read() as c:
        r = (await c.execute(select(evidence).where(evidence.c.id == evidence_id))).first()
    if not r or r.status in ("validated", "needs_work", "withdrawn"):
        return
    e = _ev_dict(r)
    user_id = str(r.user_id)
    rules = policies.scoring_rules()
    before = await growth_state(user_id)
    ai = e["ai_score"] or 0.0
    r_score = scoring.reviewer_score([reviewer], rules) if reviewer else None
    q = scoring.quality(ai, e["ai_confidence"] or 0.0, r_score, rules)
    passed = q >= rules.pass_bar and not force_needs_work
    snapshot = policies.snapshot()
    sm = await _wish().get_selected_move(e["selected_move_id"])
    skill_name = _skill_name(sm.move.careerId if sm else None, e["skill_id"])
    pts = None
    await _wish().set_selected_move_status(e["selected_move_id"], "validated" if passed else "needs_work")
    async with db.tx() as c:
        if passed:
            all_ev = (await _load(user_id))[1]
            n = scoring.recent_count(all_ev, e["skill_id"], e["activity_type"], evidence_id, rules)
            pts = scoring.points(e["activity_type"], e["difficulty_final"] or e["difficulty"], q, n, rules, policies.get("DECAY_ENABLED"))
            await c.execute(insert(score_events).values(
                user_id=user_id, kind="validated", points=pts, evidence_id=evidence_id, selected_move_id=e["selected_move_id"],
                skill_id=e["skill_id"], reason_code="evidence_validated", rules_version=rules.version,
                policy_snapshot=snapshot).on_conflict_do_nothing())
        await c.execute(update(evidence).where(evidence.c.id == evidence_id).values(
            status="validated" if passed else "needs_work", final_quality=round(q, 4), peer_confirmed=peer_confirmed,
            finalized_at=func.now(), rules_version=rules.version))
        refs = {"evidenceId": evidence_id, "selectedMoveId": e["selected_move_id"], "skillId": e["skill_id"],
                "skillName": skill_name, "points": pts, "peerConfirmed": bool(peer_confirmed), "wishId": sm.wishId if sm else None}
        bus.publish(DomainEvent(name="EvidenceValidated" if passed else "EvidenceNeedsWork", userId=user_id, refs=refs))
    if passed:
        await _after_validation(user_id, evidence_id, before, sm, e)


async def _after_validation(user_id: str, evidence_id: str, before: GrowthState, sm, e: dict) -> None:
    after = await growth_state(user_id)
    old = {s.skillId: s.tier for s in before.skills}
    async with db.tx() as c:
        for s in after.skills:
            if scoring.rank(s.tier) > scoring.rank(old.get(s.skillId, "")):
                bus.publish(DomainEvent(name="TierReached", userId=user_id,
                                        refs={"skillId": s.skillId, "skillName": s.name, "tier": s.tier}))
        for u in after.unlocks:
            if u.unlockedAt is None:
                res = await c.execute(insert(unlocks).values(user_id=user_id, opportunity_id=u.opportunityId, tier=u.tier,
                                                             source_evidence_id=evidence_id).on_conflict_do_nothing())
                if res.rowcount:
                    bus.publish(DomainEvent(name="UnlockGranted", userId=user_id, refs={
                        "opportunityId": u.opportunityId, "title": u.title, "description": u.description}))
    if policies.get("CONTRIBUTION_FROM_EVIDENCE") == "auto" and sm:
        await _profile().add_verified_contribution(user_id, evidence_id, sm.move.title, e["summary"][:1000])


async def apply_social_evidence(se: SocialEvidence) -> None:
    """Module 4 hands a buddy review over (SocialEvidence v0.1)."""
    if not se.countsTowardPoints or not policies.validation().review_finalizes():
        return
    async with db.read() as c:
        status = (await c.execute(select(evidence.c.status).where(evidence.c.id == se.evidenceId))).scalar()
    if status != "awaiting_review":
        return
    if se.confirmed is False:
        await finalize(se.evidenceId, reviewer=(se.reviewerTier, se.rating or 1), peer_confirmed=False, force_needs_work=True)
    else:
        await finalize(se.evidenceId, reviewer=(se.reviewerTier, se.rating or 3), peer_confirmed=True)


async def award_reviewer_effort(reviewer_id: str, evidence_id: str) -> None:
    """D-37: reviewing earns effort points only when REVIEWER_EARNS=effort."""
    if policies.get("REVIEWER_EARNS") != "effort":
        return
    rules = policies.scoring_rules()
    async with db.tx() as c:
        await _award_effort(c, reviewer_id, None, None, None, rules, policies.snapshot(), reason="reviewed_peer")


async def timeout_sweep() -> None:
    """D-18: evidence awaiting a buddy for BUDDY_TIMEOUT_DAYS finalises on the rubric alone (not peer-confirmed)."""
    days = policies.get("BUDDY_TIMEOUT_DAYS")
    if not days or not policies.validation().timeout_finalizes():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    async with db.read() as c:
        ids = [str(i) for i in (await c.execute(select(evidence.c.id).where(and_(
            evidence.c.status == "awaiting_review", evidence.c.created_at < cutoff)))).scalars()]
    for i in ids:
        await finalize(i, reviewer=None, peer_confirmed=False)


async def recover_stuck() -> None:
    """Startup: evidence left in 'scoring' by a restart is scored again."""
    async with db.read() as c:
        rows = (await c.execute(select(evidence.c.id, evidence.c.summary).where(evidence.c.status == "scoring"))).all()
    for r in rows:
        jobs.enqueue(f"rubric:{r.id}", lambda r=r: run_scoring(str(r.id), r.summary))


async def endorse(user_id: str, skill_id: str, tier: str, note: str | None) -> None:
    async with db.tx() as c:
        await c.execute(endorsements.insert().values(user_id=user_id, skill_id=skill_id, tier=tier, note=note))


async def is_mentor(user_id: str) -> bool:
    async with db.read() as c:
        return bool((await c.execute(select(endorsements.c.id).where(endorsements.c.user_id == user_id,
                                                                     endorsements.c.tier == "Mentor"))).first())


async def is_validated(user_id: str, evidence_id: str) -> bool:
    async with db.read() as c:
        return bool((await c.execute(select(evidence.c.id).where(evidence.c.id == evidence_id, evidence.c.user_id == user_id,
                                                                 evidence.c.status == "validated"))).first())


def _skill_name(career_id: str | None, skill_id: str) -> str:
    c = catalog.career(career_id)
    if c:
        for s in c["skills"]:
            if s["id"] == skill_id:
                return s["name"]
    return skill_id.replace("_", " ")
