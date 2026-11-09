"""The integrated loop end to end, through HTTP, with two real users (docs/PRODUCT.md story)."""
import io
import uuid

import docx

from app.platform import jobs
from app.policies import loader

pytest_plugins = []


def profile(handle: str, career="data_analyst", complete=True) -> dict:
    return {"handle": handle, "displayName": handle.title(), "headline": "CS senior", "education": {"major": "Computer Science"},
            "position": "Student", "targetCareerId": career, "skills": ["SQL", "Python"], "interests": ["sports analytics"],
            "strengths": ["explaining results"], "growthAreas": ["statistics"],
            "featuredContributions": [{"title": "Capstone dashboard", "type": "coursework", "verificationStatus": "verified"}],
            "completeOnboarding": complete}


async def onboard(api, u, handle):
    r = await api.put("/api/v1/profile", json=profile(handle), headers=u["h"])
    assert r.status_code == 200, r.text
    return r.json()["profile"]


async def make_wish(api, u, text="Get a data analyst internship"):
    wid = str(uuid.uuid4())
    assert (await api.post("/api/v1/wishes", json={"id": wid, "text": text}, headers=u["h"])).status_code == 200
    c = (await api.post("/api/v1/classify", json={"wishText": text}, headers=u["h"])).json()
    await api.post("/api/v1/wishes", json={"id": wid, "type": c["type"], "focus": c["focus"], "domains": c["domains"],
                                           "why": "real experience"}, headers=u["h"])
    q = (await api.post("/api/v1/questions", json={"wishText": text, "type": c["type"], "focus": c["focus"],
                                                   "domains": c["domains"]}, headers=u["h"])).json()
    assert q["ok"] and len(q["questions"]) == 3
    return wid


async def pick(api, u, wid, step=1, position=1):
    r = await api.post(f"/api/v1/wishes/{wid}/options", json={"step": step}, headers=u["h"])
    assert r.status_code == 200, r.text
    moves = r.json()["moves"]
    assert len(moves) == 3
    sel = await api.post(f"/api/v1/wishes/{wid}/select", json={"moveId": moves[position]["id"]}, headers=u["h"])
    assert sel.status_code == 200, sel.text
    return moves, sel.json()["selectedMove"]


async def evidence(api, u, sm_id, summary="Wrote three SQL queries over city data and published a chart."):
    r = await api.post("/api/v1/evidence", data={"selectedMoveId": sm_id, "artifactType": "text", "summary": summary}, headers=u["h"])
    assert r.status_code == 202, r.text
    await jobs.drain()
    ev_id = r.json()["evidence"]["id"]
    return (await api.get(f"/api/v1/evidence/{ev_id}", headers=u["h"])).json()["evidence"]


async def test_full_loop(api, users):
    a, b, c = await users.make("sam"), await users.make("priya"), await users.make("eve")
    me = (await api.get("/api/v1/me", headers=a["h"])).json()
    assert me["onboarded"] is False

    # Module 1: onboarding. The client can't mark its own contribution verified (D-44).
    hs = uuid.uuid4().hex[:6]
    pa = await onboard(api, a, f"sam_{hs}")
    assert pa["featuredContributions"][0]["verificationStatus"] == "self_reported"
    await onboard(api, b, f"priya_{hs}")
    await onboard(api, c, f"eve_{hs}")
    assert (await api.get("/api/v1/me", headers=a["h"])).json()["onboarded"] is True
    taken = await api.put("/api/v1/profile", json=profile(f"sam_{hs}"), headers=b["h"])
    assert taken.status_code == 400 and "taken" in taken.json()["error"]

    # Module 2: wish -> options tagged with the target career's skills (D-08, D-11) -> select
    wid = await make_wish(api, a)
    moves, sm = await pick(api, a, wid)
    allowed = {"sql", "excel", "python", "data_viz", "statistics"}
    assert all(m["skillId"] in allowed and m["activityType"] and m["difficulty"] for m in moves)
    assert sm["move"]["skillId"] in allowed and sm["status"] == "active" and sm["schemaVersion"] == "0.1"
    # One move at a time: step 2 stays closed until move 1 has evidence (D-02, D-03 submitted)
    assert (await api.post(f"/api/v1/wishes/{wid}/options", json={"step": 2}, headers=a["h"])).status_code == 409

    # Module 3: evidence -> rubric -> pending points (D-13 ai_then_buddy)
    ev = await evidence(api, a, sm["selectedMoveId"])
    assert ev["status"] == "awaiting_review" and ev["pendingPoints"] and ev["pendingPoints"] > 0
    assert set(ev["aiCriteria"]) == {"relevance", "completeness", "quality", "clarity"}
    g = (await api.get("/api/v1/growth", headers=a["h"])).json()["growth"]
    assert g["totals"]["validated"] == 0 and g["totals"]["pending"] > 0 and g["totals"]["effortRaw"] == 3
    # Validation decides credit, not the path: step 2 is open before any buddy has reviewed (D-03)
    assert (await api.get(f"/api/v1/wishes/{wid}", headers=a["h"])).json()["wish"]["nextOpen"] is True
    with loader.override(NEXT_MOVE_GATE="validated"):
        assert (await api.get(f"/api/v1/wishes/{wid}", headers=a["h"])).json()["wish"]["nextOpen"] is False

    # Module 4: invite by handle, accept, review queue, rating + confirm -> SocialEvidence -> final points
    assert (await api.get(f"/api/v1/evidence/{ev['id']}", headers=b["h"])).status_code == 404  # not a buddy yet
    inv = await api.post("/api/v1/invitations", json={"selectedMoveId": sm["selectedMoveId"], "buddy": f"priya_{hs}",
                                                      "role": "reviewer"}, headers=a["h"])
    assert inv.status_code == 201, inv.text
    again = await api.post("/api/v1/invitations", json={"selectedMoveId": sm["selectedMoveId"], "buddy": f"priya_{hs}",
                                                        "role": "reviewer"}, headers=a["h"])
    assert again.status_code == 409  # mike-branch: no re-invite
    self_inv = await api.post("/api/v1/invitations", json={"selectedMoveId": sm["selectedMoveId"], "buddy": f"sam_{hs}",
                                                           "role": "reviewer"}, headers=a["h"])
    assert self_inv.status_code == 400
    received = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"]
    inv_id = received[0]["id"]
    assert (await api.post(f"/api/v1/invitations/{inv_id}/accept", headers=b["h"])).status_code == 200
    assert (await api.get(f"/api/v1/evidence/{ev['id']}", headers=b["h"])).status_code == 200  # buddy can see it
    assert (await api.get(f"/api/v1/evidence/{ev['id']}", headers=c["h"])).status_code == 404  # others can't
    queue = (await api.get("/api/v1/reviews/queue", headers=b["h"])).json()["queue"]
    assert queue[0]["needsFeedback"] is True
    own = await api.post(f"/api/v1/invitations/{inv_id}/feedback", json={"rating": 5, "confirms": True}, headers=a["h"])
    assert own.status_code == 403  # can't review your own move
    fb = await api.post(f"/api/v1/invitations/{inv_id}/feedback", json={"rating": 4, "confirms": True, "body": "Ran it, works."},
                        headers=b["h"])
    assert fb.status_code == 200, fb.text
    assert fb.json()["socialEvidence"]["reviewerRole"] == "reviewer"
    ev2 = (await api.get(f"/api/v1/evidence/{ev['id']}", headers=a["h"])).json()["evidence"]
    assert ev2["status"] == "validated" and ev2["peerConfirmed"] is True and ev2["points"] > 0
    g = (await api.get("/api/v1/growth", headers=a["h"])).json()["growth"]
    assert g["totals"]["validated"] == ev2["points"] and g["totals"]["pending"] == 0

    # Module 5: notifications from every module, Home, best next move
    await jobs.drain()
    kinds = {i["kind"] for i in (await api.get("/api/v1/feed", headers=a["h"])).json()["items"]}
    assert {"profile_completed", "move_locked", "evidence_scored", "buddy_accepted", "feedback_received",
            "evidence_validated", "next_move_ready"} <= kinds
    assert "buddy_invited" in {i["kind"] for i in (await api.get("/api/v1/feed", headers=b["h"])).json()["items"]}
    social = (await api.get("/api/v1/feed?chip=Social", headers=a["h"])).json()["items"]
    assert social and all(i["category"] == "Social" for i in social)
    home = (await api.get("/api/v1/home", headers=a["h"])).json()
    assert home["bestNextMove"]["kind"] == "next_move_ready"
    assert home["growthSummary"]["impact"] > 0

    # The loop closes: step 2's options now include move 1's validated outcome
    moves2, sm2 = await pick(api, a, wid, step=2, position=0)
    assert sm2["move"]["step"] == 2

    # Switch a decision (D-13): with ai_only the rubric alone finalises, no buddy needed
    with loader.override(VALIDATION_MODE="ai_only"):
        ev3 = await evidence(api, a, sm2["selectedMoveId"])
        assert ev3["status"] in ("validated", "needs_work") and ev3["peerConfirmed"] is None

    # Contracts over HTTP for other teams
    assert (await api.get("/api/v1/integrations/professional-state", headers=a["h"])).json()["schemaVersion"] == "0.1"
    assert (await api.get(f"/api/v1/integrations/selected-move/{sm['selectedMoveId']}", headers=c["h"])).status_code == 404


async def test_resume_import_draft(api, users):
    a = await users.make("resume")
    d = docx.Document()
    for line in ["Sam Rivera", "Computer Science, Arizona State University", "Skills: Python, SQL, pandas, Tableau",
                 "Built a sales dashboard over 2M rows for a capstone project.", "Intern at a local analytics firm, summer 2026."]:
        d.add_paragraph(line)
    buf = io.BytesIO()
    d.save(buf)
    r = await api.post("/api/v1/profile/import", files={"file": ("resume.docx", buf.getvalue(),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, headers=a["h"])
    assert r.status_code == 202, r.text
    await jobs.drain()
    imp = (await api.get(f"/api/v1/profile/import/{r.json()['importId']}", headers=a["h"])).json()
    assert imp["status"] == "parsed" and isinstance(imp["draft"]["skills"], list)
    # Nothing was saved to the profile (D-43)
    prof = (await api.get("/api/v1/profile", headers=a["h"])).json()["profile"]
    assert prof["onboardingCompletedAt"] is None and prof["skills"] == []
    bad = await api.post("/api/v1/profile/import", files={"file": ("x.exe", b"MZ\x90\x00binary", "application/octet-stream")},
                         headers=a["h"])
    assert bad.status_code == 400


async def test_policies_admin_switch(api, users, monkeypatch):
    from app.config import config

    monkeypatch.setattr(config, "admin_password", "correct horse battery")
    r = await api.post("/api/admin/login", json={"password": "correct horse battery"})
    assert r.status_code == 200
    pol = (await api.get("/api/admin/policies")).json()["policies"]
    vm = next(p for p in pol if p["key"] == "VALIDATION_MODE")
    assert vm["decision"] == "D-13" and vm["owner"] == "Christina Phan"
    try:
        assert (await api.put("/api/admin/policies", json={"key": "VALIDATION_MODE", "value": "nonsense"})).status_code == 400
        r = await api.put("/api/admin/policies", json={"key": "VALIDATION_MODE", "value": "ai_only"})
        assert r.json()["value"] == "ai_only" and r.json()["source"] == "admin"
        cfg = (await api.get("/api/v1/config")).json()
        assert cfg["policies"]["VALIDATION_MODE"] == "ai_only"
    finally:
        await api.put("/api/admin/policies", json={"key": "VALIDATION_MODE", "value": None})
    assert loader.get("VALIDATION_MODE") == "ai_then_buddy"
