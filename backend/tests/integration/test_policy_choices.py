"""The alternative choices that restore an owner's original behaviour (docs/MODULE_OWNER_DECISIONS.md) work end to end,
not just resolve. One test per setting whose non-default choice is "your original"."""
import uuid

from app.platform import jobs
from app.policies import loader
from tests.integration.test_flow import evidence, make_wish, onboard, pick
from tests.integration.test_mike_buddy import invite, setup_three


async def _validated(api, owner, buddy, sm_id):
    """Evidence on the move, reviewed and confirmed by the buddy, so it's validated."""
    ev = await evidence(api, owner, sm_id)
    assert (await invite(api, owner, sm_id, buddy["handle"])).status_code == 201
    iid = (await api.get("/api/v1/invitations?box=received", headers=buddy["h"])).json()["invitations"][0]["id"]
    assert (await api.post(f"/api/v1/invitations/{iid}/accept", headers=buddy["h"])).status_code == 200
    fb = await api.post(f"/api/v1/invitations/{iid}/feedback", json={"rating": 5, "confirms": True, "body": "Works."}, headers=buddy["h"])
    assert fb.status_code == 200, fb.text
    await jobs.drain()
    ev = (await api.get(f"/api/v1/evidence/{ev['id']}", headers=owner["h"])).json()["evidence"]
    assert ev["status"] == "validated"
    return ev


async def test_buddy_discovery_search_is_mike_branch_search(api, users):
    """D-35 search: matches anywhere in the handle (mike-branch's LIKE %q%), never yourself, wildcards are literal."""
    a, b, c, _ = await setup_three(api, users)
    suffix = a["handle"].split("_", 1)[1]
    look = lambda q: api.get(f"/api/v1/users/lookup?handle={q}", headers=a["h"])  # noqa: E731
    assert (await look(suffix)).json()["users"] == []                                   # exact by default
    with loader.override(BUDDY_DISCOVERY="search"):
        found = [u["handle"] for u in (await look(suffix)).json()["users"]]
        assert found == sorted([b["handle"], c["handle"]])                              # middle of the handle, not self
        assert [u["handle"] for u in (await look("ob_" + suffix)).json()["users"]] == [b["handle"]]
        assert (await look("%25")).json()["users"] == []                                # % is not a wildcard
        by_email = (await api.get(f"/api/v1/users/lookup?email={b['email']}", headers=a["h"])).json()["users"]
        assert [u["handle"] for u in by_email] == [b["handle"]]                          # emails stay exact
        assert (await api.get(f"/api/v1/users/lookup?email={b['email'][:5]}", headers=a["h"])).json()["users"] == []


async def test_contribution_from_evidence_suggest_and_off(api, users):
    """D-45 suggest: validated evidence is offered; accepting adds it to the profile as verified."""
    a, b, _, sm = await setup_three(api, users)
    ev = await _validated(api, a, b, sm)
    listed = (await api.get(f"/api/v1/evidence?selectedMoveId={sm}", headers=a["h"])).json()["evidence"]
    assert listed[0]["onProfile"] is False
    assert (await api.post(f"/api/v1/evidence/{ev['id']}/add-to-profile", headers=b["h"])).status_code == 404  # not yours
    with loader.override(CONTRIBUTION_FROM_EVIDENCE="off"):
        assert (await api.post(f"/api/v1/evidence/{ev['id']}/add-to-profile", headers=a["h"])).status_code == 409
    assert (await api.post(f"/api/v1/evidence/{ev['id']}/add-to-profile", headers=a["h"])).status_code == 200
    assert (await api.post(f"/api/v1/evidence/{ev['id']}/add-to-profile", headers=a["h"])).status_code == 200  # idempotent
    listed = (await api.get(f"/api/v1/evidence?selectedMoveId={sm}", headers=a["h"])).json()["evidence"]
    assert listed[0]["onProfile"] is True
    contribs = (await api.get("/api/v1/profile", headers=a["h"])).json()["profile"]["featuredContributions"]
    assert [c["verificationStatus"] for c in contribs].count("verified") == 1


async def test_add_to_profile_needs_validated_evidence(api, users):
    a = await users.make("dana")
    await onboard(api, a, f"dana_{uuid.uuid4().hex[:6]}")
    _, sm = await pick(api, a, await make_wish(api, a))
    ev = await evidence(api, a, sm["selectedMoveId"])
    assert ev["status"] == "awaiting_review"
    assert (await api.post(f"/api/v1/evidence/{ev['id']}/add-to-profile", headers=a["h"])).status_code == 409


async def test_opportunity_chip_original_mapping(api, users):
    """D-50 events_pro: Event_Ecosystem's Opportunity chip showed Events and Pro."""
    a = await users.make("omar")
    await onboard(api, a, f"omar_{uuid.uuid4().hex[:6]}")
    await pick(api, a, await make_wish(api, a))
    await jobs.drain()
    kinds = lambda r: {i["kind"] for i in r.json()["items"]}  # noqa: E731
    assert "move_locked" not in kinds(await api.get("/api/v1/feed?chip=Opportunity", headers=a["h"]))
    with loader.override(OPPORTUNITY_CHIP="events_pro"):
        assert "move_locked" in kinds(await api.get("/api/v1/feed?chip=Opportunity", headers=a["h"]))


async def test_move_tags_source_user(api, users):
    """D-11 user: Growth-Validation's original, the evidence form's skill, activity type and difficulty are used."""
    a = await users.make("lee")
    await onboard(api, a, f"lee_{uuid.uuid4().hex[:6]}")
    _, sm = await pick(api, a, await make_wish(api, a))
    form = {"selectedMoveId": sm["selectedMoveId"], "artifactType": "text", "summary": "Ran a survey of ten classmates.",
            "skillId": "statistics", "activityType": "explore", "difficulty": "easy"}
    r = await api.post("/api/v1/evidence", data=form, headers=a["h"])        # default: the move's tags win
    assert r.status_code == 202
    assert r.json()["evidence"]["activityType"] == sm["move"]["activityType"]
    await jobs.drain()
    _, sm2 = await pick(api, a, await make_wish(api, a, "Learn statistics for analytics work"))
    with loader.override(MOVE_TAGS_SOURCE="user"):
        r = await api.post("/api/v1/evidence", data={**form, "selectedMoveId": sm2["selectedMoveId"]}, headers=a["h"])
        assert r.status_code == 202, r.text
        e = r.json()["evidence"]
        assert (e["skillId"], e["activityType"], e["difficulty"]) == ("statistics", "explore", "easy")
    await jobs.drain()
