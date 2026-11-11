"""D-38: which domain events become notifications, in which Event_Ecosystem category, with which copy.
Switch a kind off with NOTIFY_DISABLED. Copy rules: plain, no emoji, never "AI"/"smart"."""
from dataclasses import dataclass
from typing import Callable

from . import loader


@dataclass(frozen=True)
class Rule:
    kind: str
    category: str
    title: Callable[[dict], str]
    body: Callable[[dict], str]
    link: Callable[[dict], str | None]


def _pts(r: dict) -> str:
    p = r.get("points")
    return f"{p:g}" if isinstance(p, (int, float)) else str(p)


RULES: dict[str, Rule] = {
    "MoveSelected": Rule("move_locked", "Pro", lambda r: "Move locked",
                         lambda r: r.get("title", ""), lambda r: f"/moves/{r.get('wishId')}"),
    "NextMoveReady": Rule("next_move_ready", "Pro", lambda r: "Next move ready",
                          lambda r: f"Your next move for \"{r.get('wishText', 'your wish')}\" is ready to pick.",
                          lambda r: f"/moves/{r.get('wishId')}"),
    "EvidenceScored": Rule("evidence_scored", "Growth", lambda r: "Evidence scored",
                           lambda r: (f"{_pts(r)} pending points in {r.get('skillName', r.get('skillId', ''))}. "
                                      "Your buddy's review will finalise them.") if r.get("provisional")
                           else f"Rubric score {r.get('aiScore', 0):.2f}.",
                           lambda r: f"/growth/evidence/{r.get('evidenceId')}"),
    "EvidenceValidated": Rule("evidence_validated", "Impact", lambda r: "Points validated",
                              lambda r: f"{_pts(r)} points in {r.get('skillName', r.get('skillId', ''))}"
                              + ("" if r.get("peerConfirmed") else " (not peer-confirmed)") + ".",
                              lambda r: f"/growth/evidence/{r.get('evidenceId')}"),
    "EvidenceNeedsWork": Rule("evidence_needs_work", "Impact", lambda r: "Evidence needs work",
                              lambda r: "Read the feedback and submit a revision.",
                              lambda r: f"/growth/evidence/{r.get('evidenceId')}"),
    "TierReached": Rule("tier_reached", "Growth", lambda r: f"{r.get('tier')} in {r.get('skillName', r.get('skillId'))}",
                        lambda r: "You reached a new tier.", lambda r: "/growth"),
    "UnlockGranted": Rule("unlock_granted", "Enablement", lambda r: f"{r.get('title', 'Opportunity')} unlocked",
                          lambda r: r.get("description", ""), lambda r: "/growth#opportunities"),
    "InvitationCreated": Rule("buddy_invited", "Social", lambda r: f"{r.get('ownerName', 'Someone')} invited you as a {r.get('role', 'buddy')}",
                              lambda r: r.get("moveTitle", ""), lambda r: "/buddies"),
    "InvitationAccepted": Rule("buddy_accepted", "Social", lambda r: f"{r.get('buddyName', 'Your buddy')} accepted",
                               lambda r: f"They'll {'review' if r.get('role') == 'reviewer' else 'test'} \"{r.get('moveTitle', '')}\".",
                               lambda r: f"/moves/{r.get('wishId')}"),
    "InvitationDeclined": Rule("buddy_declined", "Social", lambda r: f"{r.get('buddyName', 'Your buddy')} declined",
                               lambda r: "Invite someone else for this move.", lambda r: "/buddies"),
    "FeedbackSubmitted": Rule("feedback_received", "Social", lambda r: f"{r.get('buddyName', 'Your buddy')} left feedback",
                              lambda r: r.get("comment", "")[:140], lambda r: f"/growth/evidence/{r.get('evidenceId')}"),
    "ProfileUpdated": Rule("profile_completed", "Pro", lambda r: "Profile complete",
                           lambda r: "Start a wish to get your first move.", lambda r: "/moves/new"),
}


def rule_for(event_name: str) -> Rule | None:
    r = RULES.get(event_name)
    if r is None or r.kind in loader.get("NOTIFY_DISABLED"):
        return None
    return r
