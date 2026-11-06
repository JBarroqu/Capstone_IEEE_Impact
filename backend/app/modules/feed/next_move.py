"""D-40: the single best next move on Home. The first rule in ORDER that applies wins; reorder the list to change it."""
from ...contracts import BestNextMoveTrigger

ORDER = ("review_requested", "revise_evidence", "submit_evidence", "invite_buddy", "next_move_ready", "await_buddy",
         "start_wish", "complete_profile")


def _profile():
    from ..profile import api
    return api


def _wish():
    from ..wish import api
    return api


def _social():
    from ..social import api
    return api


async def candidates(user_id: str) -> dict[str, BestNextMoveTrigger]:
    out: dict[str, BestNextMoveTrigger] = {}

    def add(kind: str, reason: str, link: str, **refs):
        if kind not in out:
            out[kind] = BestNextMoveTrigger(kind=kind, reason=reason, priority=ORDER.index(kind) + 1, link=link,
                                            refs={k: v for k, v in refs.items() if v})

    if not await _profile().is_onboarded(user_id):
        add("complete_profile", "Finish your profile so your moves fit you.", "/onboarding")
    reviews = await _social().pending_reviews(user_id)
    if reviews:
        r = reviews[0]
        name = (r.get("owner") or {}).get("displayName") or "A classmate"
        add("review_requested", f"{name} is waiting for your review of \"{(r.get('move') or {}).get('title', 'their move')}\".",
            f"/buddies/review/{r['invitationId']}", invitationId=r["invitationId"])
    moves = await _wish().list_selected_moves(user_id, "active,evidence_submitted,awaiting_review,needs_work")
    for m in moves:
        sid = m["selectedMoveId"]
        if m["status"] == "needs_work":
            add("revise_evidence", f"\"{m['title']}\" needs work. Read the feedback and submit a revision.",
                f"/moves/{m['wishId']}?move={sid}", selectedMoveId=sid, wishId=m["wishId"])
        elif m["status"] == "active":
            add("submit_evidence", f"Do \"{m['title']}\" and submit what you made.",
                f"/moves/{m['wishId']}?move={sid}", selectedMoveId=sid, wishId=m["wishId"])
        elif m["status"] == "awaiting_review":
            if not await _social().has_buddy(sid):
                add("invite_buddy", f"Invite a reviewer to confirm \"{m['title']}\".",
                    f"/moves/{m['wishId']}?move={sid}", selectedMoveId=sid, wishId=m["wishId"])
            else:
                add("await_buddy", f"Waiting for your buddy to review \"{m['title']}\".", "/buddies", selectedMoveId=sid)
    wishes = await _wish().list_wishes(user_id)
    for w in wishes:
        if w["status"] == "active" and w["moves"] and w["nextOpen"]:
            add("next_move_ready", f"Your next move for \"{w['text']}\" is ready to pick.", f"/moves/{w['id']}", wishId=w["id"])
    if not [w for w in wishes if w["status"] == "active"]:
        add("start_wish", "Start a wish to get your first move.", "/moves/new")
    return out


async def best(user_id: str) -> BestNextMoveTrigger:
    c = await candidates(user_id)
    for kind in ORDER:
        if kind in c:
            return c[kind]
    return BestNextMoveTrigger(kind="none", reason="You're all caught up.", priority=len(ORDER) + 1, link=None)
