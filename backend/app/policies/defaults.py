"""THE list of switchable product decisions. Each entry's `decision` id matches docs/MODULE_OWNER_DECISIONS.md where the
integrated app differs from what a module owner built. Resolution order: this default -> env var of the same name ->
admin override (core.settings 'policy:<KEY>'), see loader.py. Business code reads values through the getters in
app.policies, never by comparing raw strings elsewhere."""
from dataclasses import dataclass, field
from typing import Any, Literal

Kind = Literal["choice", "int", "bool", "list"]


@dataclass(frozen=True)
class PolicyDef:
    key: str
    decision: str
    module: str
    owner: str
    kind: Kind
    default: Any
    description: str
    choices: tuple = ()
    min: int | None = None
    max: int | None = None
    admin_editable: bool = True
    public: bool = False  # sent to the browser via GET /api/v1/config
    allowed_items: tuple = field(default=())  # for kind="list"


P = PolicyDef
POLICIES: tuple[PolicyDef, ...] = (
    # Module 1: Professional State (Cfoley5)
    P("ONBOARDING_REQUIRED", "D-01", "profile", "Cfoley5", "bool", True,
      "After sign-up the profile must be completed before Home.", public=True),
    P("PROFILE_IMPORT", "D-42", "profile", "Cfoley5", "choice", "on",
      "Resume upload can pre-fill the profile draft.", ("on", "off"), public=True),
    P("RESUME_RETENTION", "D-42", "profile", "Cfoley5", "choice", "delete",
      "Delete the resume file right after reading it, or keep it.", ("delete", "keep")),
    P("RESUME_MAX_MB", "D-42", "profile", "Cfoley5", "int", 5, "Largest resume upload in MB.", min=1, max=10, public=True),
    P("HANDLE_REQUIRED", "D-51", "profile", "Cfoley5", "bool", True,
      "A unique handle is required at onboarding (buddies invite by handle).", public=True),
    P("CONTRIBUTION_FROM_EVIDENCE", "D-45", "profile", "Cfoley5", "choice", "suggest",
      "Validated evidence is offered (suggest), added (auto) or ignored (off) as a verified contribution.",
      ("suggest", "auto", "off"), public=True),
    P("PROFILE_IN_MOVES", "D-06", "profile", "Cfoley5", "choice", "summary",
      "What of the profile the move generator sees: summary (no name, bio, school), full, or off.",
      ("summary", "full", "off")),
    # Module 2: Wish & Next Move (Waleed)
    P("MOVES_PER_WISH", "D-02", "wish", "Waleed", "choice", 1,
      "1 = one move at a time; 3 = pick a 3-move path up front.", (1, 3), public=True),
    P("NEXT_MOVE_GATE", "D-03", "wish", "Waleed", "choice", "validated",
      "When the next move for a wish opens.", ("validated", "ai_scored", "submitted", "none"), public=True),
    P("MAX_STEPS_PER_WISH", "D-05", "wish", "Waleed", "int", 5, "Most moves per wish.", min=1, max=5, public=True),
    P("NEXT_MOVE_CONTEXT", "D-07", "wish", "Waleed", "choice", "outcomes",
      "The next move's prompt includes how the previous move went.", ("outcomes", "off")),
    P("MOVE_TAGS_SOURCE", "D-11", "wish", "Waleed", "choice", "model",
      "Who sets activity type, difficulty and skill: the model when generating, or the user at evidence time.",
      ("model", "user"), public=True),
    P("SURVEY_SCREENS", "D-46", "wish", "Waleed", "choice", "off",
      "Show the Wish Engine study's usefulness rating after a move is locked.", ("off", "on"), public=True),
    P("MAX_ACTIVE_WISHES", "D-53", "wish", "Waleed", "int", 0, "Most active wishes per user (0 = unlimited).",
      min=0, max=50, public=True),
    # Module 3: Activity, Evidence & Growth (Christina Phan)
    P("SKILL_MODEL", "D-08", "growth", "Christina Phan", "choice", "taxonomy",
      "Skills come from the career taxonomy in data/catalog.json, or from the user's free-form profile skills.",
      ("taxonomy", "freeform"), public=True),
    P("VALIDATION_MODE", "D-13", "growth", "Christina Phan", "choice", "ai_then_buddy",
      "Rubric gives pending points and a buddy confirms them (ai_then_buddy); rubric alone is final (ai_only); "
      "no points until a buddy reviews (buddy_required).", ("ai_then_buddy", "ai_only", "buddy_required"), public=True),
    P("BUDDY_TIMEOUT_DAYS", "D-18", "growth", "Christina Phan", "int", 7,
      "Days to wait for a buddy review before finalising on the rubric alone (0 = wait forever).", min=0, max=60,
      public=True),
    P("BUDDY_TIER_SOURCE", "D-14", "growth", "Christina Phan", "choice", "role_tier",
      "A reviewer's weight comes from their own role tier (floored at Proficient) or a fixed tier.",
      ("role_tier", "fixed")),
    P("BUDDY_FIXED_TIER", "D-14", "growth", "Christina Phan", "choice", "Proficient",
      "Tier used for every reviewer when BUDDY_TIER_SOURCE=fixed.", ("Proficient", "Demonstrated", "Verified")),
    P("PROVISIONAL_COUNTS", "D-17", "growth", "Christina Phan", "bool", False,
      "Pending (unconfirmed) points count toward tiers and unlocks.", public=True),
    P("EFFORT_RULE", "D-21", "growth", "Christina Phan", "choice", "per_move_once",
      "Effort points once per selected move, or for every submission (Growth-Validation original).",
      ("per_move_once", "per_submission")),
    P("UNLOCK_MATCH", "D-25", "growth", "Christina Phan", "choice", "at_least",
      "An opportunity unlocks when a skill is at least its tier, or exactly its tier (original).",
      ("at_least", "exact")),
    P("SCORING_RULES", "D-23", "growth", "Christina Phan", "choice", "v1.1",
      "Scoring rules version: v1.1 checks tier gates in order; v1.0 is Growth-Validation exactly.", ("v1.1", "v1.0")),
    P("VERIFIED_REQUIRES", "D-24", "growth", "Christina Phan", "choice", "admin_endorsement",
      "Verified needs an admin endorsement, or points alone.", ("admin_endorsement", "points")),
    P("AI_DIFFICULTY_ADJUST", "D-12", "growth", "Christina Phan", "choice", "one_level",
      "The rubric may move difficulty by one level (Growth-Validation rule).", ("one_level", "off")),
    P("DECAY_ENABLED", "D-22", "growth", "Christina Phan", "bool", True,
      "Repeating the same skill and activity type within 30 days earns less."),
    # Module 4: Human Roles & Social Support (Michael Hawes)
    P("BUDDY_ROLES", "D-30", "social", "Michael Hawes", "list", ["reviewer", "tester"],
      "Buddy roles that can be invited.", allowed_items=("reviewer", "tester"), public=True),
    P("TESTER_COUNTS", "D-30", "social", "Michael Hawes", "bool", False,
      "A tester's feedback counts toward points like a reviewer's.", public=True),
    P("BUDDIES_PER_MOVE", "D-31", "social", "Michael Hawes", "int", 1, "Accepted buddies per role per move.",
      min=1, max=5, public=True),
    P("REINVITE_AFTER_DECLINE", "D-33", "social", "Michael Hawes", "bool", False,
      "The same person can be invited again to a move after declining."),
    P("BUDDY_DISCOVERY", "D-35", "social", "Michael Hawes", "choice", "exact",
      "Find buddies by typing the exact handle or email, or search (mike-branch original): results appear as you "
      "type, matching anywhere in the handle, up to 20, each with an Invite button.", ("exact", "search"), public=True),
    P("REVIEWER_EARNS", "D-37", "social", "Michael Hawes", "choice", "none",
      "Reviewing someone else earns nothing, or effort points.", ("none", "effort"), public=True),
    # Module 5: Opportunity & Event Return (JBarroqu)
    P("NOTIFY_DISABLED", "D-38", "feed", "JBarroqu", "list", [],
      "Notification kinds that are switched off.",
      allowed_items=("move_locked", "next_move_ready", "evidence_scored", "evidence_validated", "evidence_needs_work",
                     "tier_reached", "unlock_granted", "buddy_invited", "buddy_accepted", "buddy_declined",
                     "feedback_received", "profile_completed")),
    P("WYWA_MODE", "D-39", "feed", "JBarroqu", "choice", "since_last_visit",
      "While You Were Away shows items since the previous visit, or from the last 7 days.",
      ("since_last_visit", "days:7"), public=True),
    P("OPPORTUNITY_CHIP", "D-50", "feed", "JBarroqu", "choice", "enablement_events",
      "Categories the Opportunity chip on Home shows: Enablement and Events, or Events and Pro (Event_Ecosystem original).",
      ("enablement_events", "events_pro")),
    P("EVENT_SOURCES", "D-41", "feed", "JBarroqu", "choice", "none", "External event detection (not built yet).",
      ("none",), public=True),
)

BY_KEY = {p.key: p for p in POLICIES}
