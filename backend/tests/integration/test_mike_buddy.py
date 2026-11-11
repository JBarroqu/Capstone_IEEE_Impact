"""mike-branch tests/test_api.py (@ 402939b), ported. Projects and milestones are now selected moves and evidence
(D-32); auth/session cases are covered by Supabase and tests/unit/test_security.py. Each block names the original."""
import uuid

from app.policies import loader
from tests.integration.test_flow import evidence, make_wish, onboard, pick


async def setup_three(api, users):
    hs = uuid.uuid4().hex[:6]
    a, b, c = await users.make("alice"), await users.make("bob"), await users.make("charlie")
    for u, n in ((a, "alice"), (b, "bob"), (c, "charlie")):
        u["handle"] = f"{n}_{hs}"
        await onboard(api, u, u["handle"])
    wid = await make_wish(api, a)
    _, sm = await pick(api, a, wid)
    return a, b, c, sm["selectedMoveId"]


async def invite(api, owner, sm_id, handle, role="reviewer"):
    return await api.post("/api/v1/invitations", json={"selectedMoveId": sm_id, "buddy": handle, "role": role}, headers=owner["h"])


async def test_search_and_invitation_workflow(api, users):
    """test_search_and_invitation_workflow"""
    a, b, c, sm = await setup_three(api, users)
    assert (await api.get("/api/v1/users/lookup", headers=a["h"])).status_code == 400              # empty query
    found = (await api.get(f"/api/v1/users/lookup?handle={b['handle']}", headers=a["h"])).json()["users"]
    assert [u["handle"] for u in found] == [b["handle"]]
    assert (await api.get("/api/v1/users/lookup?handle=%25", headers=a["h"])).json()["users"] == []  # no wildcard
    assert (await api.get(f"/api/v1/users/lookup?handle={b['handle'][:4]}", headers=a["h"])).json()["users"] == []  # exact (D-35)
    assert (await invite(api, a, sm, a["handle"])).status_code == 400                               # self-invite
    assert (await invite(api, a, sm, "nobody_here_x")).status_code == 404
    assert (await invite(api, a, sm, b["handle"])).status_code == 201
    assert (await invite(api, a, sm, b["handle"])).status_code == 409                               # duplicate
    invites = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"]
    assert len(invites) == 1
    iid = invites[0]["id"]
    assert (await api.post(f"/api/v1/invitations/{iid}/accept", headers=c["h"])).status_code == 404  # not the invitee
    assert (await api.post(f"/api/v1/invitations/{iid}/maybe", headers=b["h"])).status_code == 404   # invalid action
    assert (await api.get(f"/api/v1/selected-moves/{sm}", headers=b["h"])).status_code == 404        # pending: no access
    assert (await api.post(f"/api/v1/invitations/{iid}/accept", headers=b["h"])).status_code == 200
    assert (await api.post(f"/api/v1/invitations/{iid}/decline", headers=b["h"])).status_code == 409  # already answered
    assert (await api.get(f"/api/v1/selected-moves/{sm}", headers=b["h"])).json()["role"] == "buddy"
    assert (await api.get(f"/api/v1/selected-moves/{sm}", headers=c["h"])).status_code == 404
    sent = (await api.get("/api/v1/invitations?box=sent", headers=a["h"])).json()["invitations"]
    assert len(sent) == 1 and sent[0]["buddy"]["handle"] == b["handle"]
    assert (await api.post(f"/api/v1/invitations/{iid}/revoke", headers=a["h"])).status_code == 200
    assert (await api.get(f"/api/v1/selected-moves/{sm}", headers=b["h"])).status_code == 404        # access gone


async def test_decline_and_reinvite(api, users):
    """test_decline_and_reinvite (D-33: re-invite after decline is a setting, off by default)"""
    a, b, _, sm = await setup_three(api, users)
    await invite(api, a, sm, b["handle"])
    iid = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"][0]["id"]
    assert (await api.post(f"/api/v1/invitations/{iid}/decline", headers=b["h"])).status_code == 200
    assert (await api.get(f"/api/v1/selected-moves/{sm}", headers=b["h"])).status_code == 404
    assert (await invite(api, a, sm, b["handle"])).status_code == 409
    with loader.override(REINVITE_AFTER_DECLINE=True):
        assert (await invite(api, a, sm, b["handle"])).status_code == 201


async def test_feedback_permissions_and_validation(api, users):
    """test_feedback_permissions_and_validation (tester role: free-text feedback, D-30)"""
    a, b, c, sm = await setup_three(api, users)
    await evidence(api, a, sm)
    await invite(api, a, sm, b["handle"], role="tester")
    iid = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"][0]["id"]
    path = f"/api/v1/invitations/{iid}/feedback"
    assert (await api.post(path, json={"body": "Owner"}, headers=a["h"])).status_code == 403   # owner
    assert (await api.post(path, json={"body": "Pending"}, headers=b["h"])).status_code == 403  # not accepted yet
    await api.post(f"/api/v1/invitations/{iid}/accept", headers=b["h"])
    assert (await api.post(path, json={"body": ""}, headers=b["h"])).status_code == 400
    assert (await api.post(path, json={"body": "x" * 1001}, headers=b["h"])).status_code == 400
    assert (await api.post(path, json={"body": "Good progress"}, headers=b["h"])).status_code == 200
    assert (await api.get(f"/api/v1/selected-moves/{sm}/feedback", headers=c["h"])).status_code == 404
    fb = (await api.get(f"/api/v1/selected-moves/{sm}/feedback", headers=a["h"])).json()["feedback"]
    assert fb[0]["body"] == "Good progress" and fb[0]["author"]["handle"] == b["handle"]
    assert (await api.get(f"/api/v1/selected-moves/{sm}/feedback", headers=b["h"])).json()["feedback"][0]["body"] == "Good progress"
    # A tester's feedback doesn't change points (TESTER_COUNTS=false)
    ev = (await api.get(f"/api/v1/evidence?selectedMoveId={sm}", headers=a["h"])).json()["evidence"][0]
    assert ev["status"] == "awaiting_review"


async def test_one_accepted_buddy_per_role(api, users):
    """one accepted buddy (D-31), now per role"""
    a, b, c, sm = await setup_three(api, users)
    await invite(api, a, sm, b["handle"])
    await invite(api, a, sm, c["handle"])
    ib = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"][0]["id"]
    ic = (await api.get("/api/v1/invitations?box=received", headers=c["h"])).json()["invitations"][0]["id"]
    assert (await api.post(f"/api/v1/invitations/{ib}/accept", headers=b["h"])).status_code == 200
    assert (await api.post(f"/api/v1/invitations/{ic}/accept", headers=c["h"])).status_code == 409


async def test_reviewer_not_confirming_is_needs_work(api, users):
    """D-19: a reviewer who doesn't confirm sends the evidence to needs work."""
    a, b, _, sm = await setup_three(api, users)
    ev = await evidence(api, a, sm)
    await invite(api, a, sm, b["handle"])
    iid = (await api.get("/api/v1/invitations?box=received", headers=b["h"])).json()["invitations"][0]["id"]
    await api.post(f"/api/v1/invitations/{iid}/accept", headers=b["h"])
    r = await api.post(f"/api/v1/invitations/{iid}/feedback", json={"rating": 3, "confirms": False, "body": "Link is broken"}, headers=b["h"])
    assert r.status_code == 200
    ev2 = (await api.get(f"/api/v1/evidence/{ev['id']}", headers=a["h"])).json()["evidence"]
    assert ev2["status"] == "needs_work" and ev2["peerConfirmed"] is False


async def test_database_integrity_and_cascades(api, users):
    """test_database_integrity_and_cascades: deleting the owner's account removes their moves, invitations, feedback."""
    from sqlalchemy import text

    from app import db

    a, b, _, sm = await setup_three(api, users)
    await invite(api, a, sm, b["handle"])
    async with db.read() as c:
        assert (await c.execute(text("select count(*) from social.invitations where selected_move_id = :s"), {"s": sm})).scalar() == 1
    async with db.tx() as c:
        await c.execute(text("delete from auth.users where id = :u"), {"u": a["id"]})
    async with db.read() as c:
        assert (await c.execute(text("select count(*) from social.invitations where selected_move_id = :s"), {"s": sm})).scalar() == 0
        assert (await c.execute(text("select count(*) from wish.selected_moves where id = :s"), {"s": sm})).scalar() == 0
        assert (await c.execute(text("select count(*) from profile.profiles where user_id = :u"), {"u": b["id"]})).scalar() == 1
