from datetime import datetime, timezone, timedelta
from math import ceil
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import ScoreEvent, Evidence, Review, EffortWeek, UserUnlock, UserBadge
from .catalog import CAREERS, OPPORTUNITIES

RULES_VERSION = "1.0"
BASE = {"explore":10, "create":20, "test":20, "share":15, "connect":10, "enable":10}
DIFFICULTY = {"easy":1.0, "moderate":1.5, "hard":2.0}
TIER_ORDER = ["Familiar", "Proficient", "Demonstrated", "Verified"]
THRESHOLDS = {"Familiar":30, "Proficient":100, "Demonstrated":250, "Verified":500}

def add_effort(db: Session, user_id: int, points: int, reason: str, evidence_id=None, skill_id=None):
    now = datetime.now(timezone.utc)
    iso = now.strftime("%G-W%V")
    week = db.scalar(select(EffortWeek).where(EffortWeek.user_id==user_id, EffortWeek.iso_week==iso))
    if not week:
        week = EffortWeek(user_id=user_id, iso_week=iso, raw_points=0); db.add(week); db.flush()
    allowed = max(0, min(points, 20 - week.raw_points))
    week.raw_points += allowed
    if allowed:
        db.add(ScoreEvent(user_id=user_id, kind="effort", points=allowed, evidence_id=evidence_id,
                          skill_id=skill_id, reason_code=reason, rules_version=RULES_VERSION))
    db.flush()
    return allowed

def totals(db: Session, user_id: int):
    events = db.scalars(select(ScoreEvent).where(ScoreEvent.user_id==user_id)).all()
    v = sum(x.points for x in events if x.kind=="validated")
    e = sum(x.points for x in events if x.kind=="effort")
    ceiling = max(30.0, (3/7)*v)
    counted = min(e, ceiling)
    return round(v,2), round(counted,2), round(max(0,e-counted),2), round(v+counted,2)

def skill_state(db: Session, user_id: int, career_id: str):
    career = CAREERS.get(career_id, CAREERS["data_analyst"])
    events = db.scalars(select(ScoreEvent).where(ScoreEvent.user_id==user_id, ScoreEvent.kind=="validated")).all()
    output=[]
    for s in career["skills"]:
        pts = sum(e.points for e in events if e.skill_id==s["id"])
        tier = "Not started"
        for t in TIER_ORDER:
            if pts >= THRESHOLDS[t]: tier=t
        if tier=="Proficient":
            valid_count = len(db.scalars(select(Evidence).where(Evidence.user_id==user_id, Evidence.skill_id==s["id"], Evidence.status=="validated")).all())
            if valid_count < 2: tier="Familiar"
        if tier=="Demonstrated":
            evs = db.scalars(select(Evidence).where(Evidence.user_id==user_id, Evidence.skill_id==s["id"], Evidence.status=="validated")).all()
            has_hard = any(e.difficulty=="hard" for e in evs)
            senior = any(r.reviewer_tier in ("Demonstrated","Verified","Mentor") for e in evs for r in db.scalars(select(Review).where(Review.evidence_id==e.id)).all())
            if not (has_hard and senior): tier="Proficient"
        if tier=="Verified":
            # MVP endorsement flag is seeded/admin-set; not user-farmable.
            tier="Demonstrated"
        next_threshold = next((THRESHOLDS[t] for t in TIER_ORDER if THRESHOLDS[t] > pts), 500)
        output.append({**s,"points":round(pts,2),"tier":tier,"next_threshold":next_threshold,
                       "progress":min(100,round(pts/next_threshold*100))})
    return output

def role_tier(skills):
    core=[s for s in skills if s["core"]]
    if not core: return "Not started"
    result="Not started"
    for tier in TIER_ORDER:
        needed=ceil(.60*len(core))
        if sum(1 for s in core if s["tier"]==tier or (TIER_ORDER.index(s["tier"])>=TIER_ORDER.index(tier) if s["tier"] in TIER_ORDER else False)) >= needed:
            result=tier
    return result

def award_validated(db: Session, evidence: Evidence, ai_score: float, confidence: float):
    reviews = db.scalars(select(Review).where(Review.evidence_id==evidence.id)).all()
    if not reviews: return False
    weights={"Proficient":.8,"Demonstrated":1.0,"Verified":1.2,"Mentor":1.2}
    r=sum(weights.get(x.reviewer_tier,1.0)*((x.rating-1)/4) for x in reviews)/sum(weights.get(x.reviewer_tier,1.0) for x in reviews)
    a=ai_score
    q=(.2*a+.8*r) if confidence < .5 else (.4*a+.6*r)
    if q < .5:
        evidence.status="needs_work"; evidence.ai_feedback=(evidence.ai_feedback or "")+"\n\nReview outcome: needs work. Please address the feedback and resubmit."
        db.flush(); return False
    prior=db.scalars(select(Evidence).where(Evidence.user_id==evidence.user_id, Evidence.skill_id==evidence.skill_id,
      Evidence.move_type==evidence.move_type, Evidence.status=="validated",
      Evidence.created_at >= datetime.now(timezone.utc)-timedelta(days=30))).all()
    n=len(prior)+1
    decay=max(.2,.7**(n-1))
    base=BASE.get(evidence.move_type,10)
    difficulty=DIFFICULTY.get(evidence.difficulty,1.5)
    points=round(base*difficulty*q*decay,2)
    exists=db.scalar(select(ScoreEvent).where(ScoreEvent.evidence_id==evidence.id, ScoreEvent.kind=="validated"))
    if not exists:
        db.add(ScoreEvent(user_id=evidence.user_id,kind="validated",points=points,evidence_id=evidence.id,
                          skill_id=evidence.skill_id,reason_code="evidence_validated",rules_version=RULES_VERSION))
    evidence.status="validated"
    db.flush()
    return True

def update_unlocks(db: Session, user_id: int, skills):
    # Unlocks are evaluated from actual capability thresholds; tier-specific requirements
    # are checked in skill_state. Role-wide items use the role tier.
    achieved=set()
    for s in skills:
        if s["tier"] in TIER_ORDER:
            achieved.add(s["tier"])
    for op in OPPORTUNITIES:
        if op["tier"] in achieved:
            old=db.scalar(select(UserUnlock).where(UserUnlock.user_id==user_id,UserUnlock.opportunity_id==op["id"]))
            if not old:
                db.add(UserUnlock(user_id=user_id,opportunity_id=op["id"]))
    db.flush()
