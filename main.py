import os, json, uuid
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select
from .config import settings
from .database import Base, engine, get_db
from .models import User, Evidence, Review, ScoreEvent, UserUnlock, UserBadge
from .schemas import RegisterIn, LoginIn, CareerIn, EvidenceIn
from .auth import hash_password, verify_password, make_token, current_user
from .catalog import CAREERS, MOVES, OPPORTUNITIES
from .scoring import add_effort, totals, skill_state, role_tier, award_validated, update_unlocks
import logging
from .ai import rate_evidence, AIBusyError, BUSY_MESSAGE

log=logging.getLogger("impact")

app=FastAPI(title="IEEE Impact++ Growth & Evidence API", version="1.0.0")
origins = [
    "https://bunnie114.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)

def user_payload(u):
    return {"id":u.id,"name":u.name,"email":u.email,"career_id":u.career_id}

def process_review(db, ev, ai_result):
    # Simulated reviewer pool. Labelled transparently in the UI and API.
    reviewers=[("Jordan Davis","Demonstrated"),("Morgan Kim","Proficient"),("Alex Smith","Verified")]
    # Deterministic plausible rating near AI score for repeatable demo.
    rating=max(1,min(5,round(ai_result["overall_score"]*4+1)))
    name,tier=reviewers[ev.id % len(reviewers)]
    db.add(Review(evidence_id=ev.id,reviewer_name=name,reviewer_tier=tier,rating=rating,
                  comment="Simulated peer review: the submission is relevant. Clarify the process and show the result more explicitly."))
    db.flush()
    if abs(ai_result["overall_score"]-((rating-1)/4)) > .35:
        name2,tier2=reviewers[(ev.id+1)%len(reviewers)]
        rating2=max(1,min(5,round(ai_result["overall_score"]*4+1)))
        db.add(Review(evidence_id=ev.id,reviewer_name=name2,reviewer_tier=tier2,rating=rating2,
                      comment="Second simulated review requested because the first review differed from the AI score."))
        db.flush()
    ok=award_validated(db,ev,ai_result["overall_score"],ai_result["confidence"])
    return ok

@app.get("/")
def root(): return {"service":"IEEE Impact++ API","status":"ok"}

@app.get("/health")
def health(): return {"status":"healthy"}

@app.post("/auth/register")
def register(body:RegisterIn, db:Session=Depends(get_db)):
    if db.scalar(select(User).where(User.email==body.email.lower())):
        raise HTTPException(409,"An account with this email already exists.")
    u=User(name=body.name,email=body.email.lower(),password_hash=hash_password(body.password))
    db.add(u); db.commit(); db.refresh(u)
    return {"access_token":make_token(u.id),"token_type":"bearer","user":user_payload(u)}

@app.post("/auth/login")
def login(body:LoginIn, db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.email==body.email.lower()))
    if not u or not verify_password(body.password,u.password_hash):
        raise HTTPException(401,"Email or password is incorrect.")
    return {"access_token":make_token(u.id),"token_type":"bearer","user":user_payload(u)}

@app.get("/me")
def me(u:User=Depends(current_user)): return user_payload(u)

@app.get("/catalog")
def catalog(): return {"careers":CAREERS,"moves":MOVES,"opportunities":OPPORTUNITIES}

@app.put("/career")
def set_career(body:CareerIn, db:Session=Depends(get_db), u:User=Depends(current_user)):
    if body.career_id not in CAREERS: raise HTTPException(400,"Unknown career path.")
    u.career_id=body.career_id; db.commit()
    return {"career_id":u.career_id}

@app.get("/dashboard")
def dashboard(db:Session=Depends(get_db), u:User=Depends(current_user)):
    v,e,banked,score=totals(db,u.id)
    skills=skill_state(db,u.id,u.career_id)
    update_unlocks(db,u.id,skills); db.commit()
    unlock_ids={x.opportunity_id for x in db.scalars(select(UserUnlock).where(UserUnlock.user_id==u.id)).all()}
    evs=db.scalars(select(Evidence).where(Evidence.user_id==u.id).order_by(Evidence.created_at.desc()).limit(5)).all()
    return {"user":user_payload(u),"career":CAREERS[u.career_id],"impact_score":score,
      "validated_points":v,"effort_points_counted":e,"effort_points_banked":banked,
      "effort_share":round((e/score*100),1) if score else 0,"skills":skills,"role_tier":role_tier(skills),
      "recent_evidence":[{"id":x.id,"summary":x.summary[:100],"status":x.status,"created_at":x.created_at.isoformat()} for x in evs],
      "unlocks":[{**op,"unlocked":op["id"] in unlock_ids} for op in OPPORTUNITIES]}

@app.get("/moves")
def moves(db:Session=Depends(get_db),u:User=Depends(current_user)):
    skills=skill_state(db,u.id,u.career_id)
    gaps={s["id"]:s["points"] for s in skills}
    return sorted(MOVES,key=lambda m:(gaps.get(m["skill"],0), m["difficulty"]=="hard"))



def save_upload(upload: UploadFile):
    allowed_extensions = {
        ".pdf", ".docx", ".txt", ".png",
        ".jpg", ".jpeg", ".webp"
    }

    filename = upload.filename or "artifact"
    suffix = Path(filename).suffix.lower()

    if suffix not in allowed_extensions:
        raise HTTPException(
            415,
            "Supported uploads: PDF, DOCX, PNG, JPG, WEBP, and TXT."
        )

    data = upload.file.read()

    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File must be 10 MB or smaller.")

    if not data:
        raise HTTPException(400, "The uploaded file is empty.")

    folder = Path(settings.upload_dir)
    folder.mkdir(parents=True, exist_ok=True)

    path = folder / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(data)

    extracted = ""

    try:
        import io

        if suffix == ".pdf":
            from pypdf import PdfReader
            extracted = " ".join(
                p.extract_text() or ""
                for p in PdfReader(io.BytesIO(data)).pages
            )[:12000]

        elif suffix == ".docx":
            from docx import Document
            extracted = "\n".join(
                p.text for p in Document(io.BytesIO(data)).paragraphs
            )[:12000]

        elif suffix == ".txt":
            extracted = data.decode("utf-8", errors="ignore")[:12000]

    except Exception:
        extracted = ""

    return str(path), extracted



@app.post("/evidence")
def submit_evidence(move_id:str=Form(...),skill_id:str=Form(...),move_type:str=Form(...),
    difficulty:str=Form("moderate"),artifact_type:str=Form(...),summary:str=Form(...),
    artifact_url:str|None=Form(None),file:UploadFile|None=File(None),
    db:Session=Depends(get_db),u:User=Depends(current_user)):
    if artifact_type not in ("summary","link","file"): raise HTTPException(400,"Invalid artifact type.")
    file_path=None; extracted=""
    # Browsers send an empty file part (filename="") when no file is chosen.
    if file is not None and file.filename:
        file_path,extracted=save_upload(file)
    if artifact_type=="link" and not artifact_url: raise HTTPException(400,"A URL is required.")
    if artifact_type=="file" and not file_path: raise HTTPException(400,"Please attach a file.")
    full_summary=(summary+("\n\nExtracted file text:\n"+extracted if extracted else "")).strip()
    ev=Evidence(user_id=u.id,move_id=move_id,skill_id=skill_id,move_type=move_type,difficulty=difficulty,
      artifact_type=artifact_type,artifact_url=artifact_url,file_path=file_path,summary=full_summary,status="submitted")
    db.add(ev); db.flush()
    add_effort(db,u.id,3,"evidence_submission",ev.id,skill_id)
    db.commit()  # persist the submission first so it always shows in history
    return grade_evidence(db,u,ev)

def grade_evidence(db,u,ev):
    """Run AI grading + simulated review for a saved evidence row.
    If the AI is unavailable the row stays as 'ai_error' and can be retried via /evidence/{id}/regrade."""
    ev_id=ev.id
    try:
        difficulty=ev.difficulty
        skill_name=next((s["name"] for s in CAREERS[u.career_id]["skills"] if s["id"]==ev.skill_id),ev.skill_id)
        ai=rate_evidence(ev.summary,skill_name,ev.artifact_type,ev.artifact_url)
        ev.ai_score=ai["overall_score"]; ev.ai_confidence=ai["confidence"]
        ev.ai_feedback=ai["feedback"]; ev.ai_criteria=json.dumps(ai["criteria"])
        ev.status="in_review"
        if ai.get("suggested_difficulty") in ("easy","moderate","hard"):
            # AI may shift difficulty by at most one level.
            order=["easy","moderate","hard"]
            original=order.index(difficulty) if difficulty in order else 1
            suggested=order.index(ai["suggested_difficulty"])
            ev.difficulty=order[max(0,min(2, max(original-1,min(original+1,suggested))))]
        process_review(db,ev,ai)
        skills=skill_state(db,u.id,u.career_id); update_unlocks(db,u.id,skills)
        db.commit(); db.refresh(ev)
        return evidence_payload(ev,db)
    except Exception as ex:
        db.rollback()  # discard any half-written review/score rows
        busy=isinstance(ex,AIBusyError)
        message=BUSY_MESSAGE if busy else "Your evidence was saved, but AI evaluation couldn't be completed. Please try again later."
        log.warning("AI evaluation failed for evidence %s: %r",ev_id,ex)  # full detail stays in server logs
        ev=db.get(Evidence,ev_id)
        ev.status="ai_error"; ev.ai_feedback=message
        db.commit()
        raise HTTPException(503 if busy else 502,message)

@app.post("/evidence/{evidence_id}/regrade")
def regrade_evidence(evidence_id:int,db:Session=Depends(get_db),u:User=Depends(current_user)):
    ev=db.get(Evidence,evidence_id)
    if not ev or ev.user_id!=u.id: raise HTTPException(404,"Evidence not found.")
    if ev.status!="ai_error": raise HTTPException(409,"This evidence has already been graded.")
    return grade_evidence(db,u,ev)

def evidence_payload(ev,db):
    reviews=db.scalars(select(Review).where(Review.evidence_id==ev.id)).all()
    return {"id":ev.id,"move_id":ev.move_id,"skill_id":ev.skill_id,"artifact_type":ev.artifact_type,
      "artifact_url":ev.artifact_url,"summary":ev.summary,"status":ev.status,"ai_score":ev.ai_score,
      "ai_confidence":ev.ai_confidence,"ai_feedback":ev.ai_feedback,
      "ai_criteria":json.loads(ev.ai_criteria) if ev.ai_criteria else {},
      "reviews":[{"reviewer_name":r.reviewer_name,"reviewer_tier":r.reviewer_tier,"rating":r.rating,
                  "comment":r.comment,"simulated":True} for r in reviews],
      "created_at":ev.created_at.isoformat()}

@app.get("/evidence")
def list_evidence(db:Session=Depends(get_db),u:User=Depends(current_user)):
    rows=db.scalars(select(Evidence).where(Evidence.user_id==u.id).order_by(Evidence.created_at.desc())).all()
    return [evidence_payload(x,db) for x in rows]

@app.get("/score-events")
def score_events(db:Session=Depends(get_db),u:User=Depends(current_user)):
    rows=db.scalars(select(ScoreEvent).where(ScoreEvent.user_id==u.id).order_by(ScoreEvent.created_at.desc()).limit(100)).all()
    return [{"id":x.id,"kind":x.kind,"points":x.points,"reason":x.reason_code,"skill_id":x.skill_id,
             "created_at":x.created_at.isoformat()} for x in rows]

@app.get("/opportunities")
def opportunities(db:Session=Depends(get_db),u:User=Depends(current_user)):
    ids={x.opportunity_id for x in db.scalars(select(UserUnlock).where(UserUnlock.user_id==u.id)).all()}
    return [{**o,"unlocked":o["id"] in ids} for o in OPPORTUNITIES]

@app.get("/badges")
def badges(db:Session=Depends(get_db),u:User=Depends(current_user)):
    events=db.scalars(select(ScoreEvent).where(ScoreEvent.user_id==u.id)).all()
    effort=sum(e.points for e in events if e.kind=="effort")
    items=[
      {"id":"first-evidence","name":"First Steps","rarity":"Common","description":"Submit your first evidence.","earned":db.scalar(select(Evidence).where(Evidence.user_id==u.id)) is not None},
      {"id":"consistent","name":"Consistent Contributor","rarity":"Rare","description":"Earn 20 effort points.","earned":effort>=20},
      {"id":"builder","name":"Project Builder","rarity":"Uncommon","description":"Validate a Create move.","earned":db.scalar(select(Evidence).where(Evidence.user_id==u.id,Evidence.move_type=="create",Evidence.status=="validated")) is not None},
      {"id":"reviewed","name":"Evidence Validated","rarity":"Uncommon","description":"Get evidence validated.","earned":db.scalar(select(Evidence).where(Evidence.user_id==u.id,Evidence.status=="validated")) is not None}
    ]
    return items

@app.post("/integrations/selected-move")
def selected_move(payload:dict):
    # Standalone MVP contract stub: accepts the shape proposed in the module spec.
    return {"accepted":True,"mode":"standalone_stub","received":payload}

@app.get("/integrations/growth-state")
def integration_growth(db:Session=Depends(get_db),u:User=Depends(current_user)):
    v,e,b,s=totals(db,u.id); skills=skill_state(db,u.id,u.career_id)
    return {"user_id":u.id,"impact_score":s,"validated_points":v,"effort_points_counted":e,
            "effort_points_banked":b,"skills":skills,"role_tier":role_tier(skills),"rules_version":"1.0"}