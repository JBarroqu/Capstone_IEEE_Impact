from datetime import datetime, timezone

from wish_api.analytics import choices_rows, classifier_accuracy, feedback_rows, funnel, journeys, key_numbers, leaderboard, reject_reasons
from wish_api.csv_export import to_csv

_i = {"n": 0}


def ev(name, payload=None, **o):
    _i["n"] += 1
    base = {"createdAt": datetime.fromtimestamp(1_700_000_000 + _i["n"], timezone.utc), "clientTs": None, "sessionId": "s1", "wishId": "w1",
            "participantCode": "P01", "provider": "gemini", "name": name, "step": 1, "payload": payload or {}}
    return {**base, **o}


WISHES = [{"id": "w1", "sessionId": "s1", "text": "Learn DevOps", "type": "open_ended", "focus": ["learn"], "domains": ["technical"], "archetype": "builder", "why": "job"}]
LOG = [
    ev("session_started", step=None), ev("consent_given", step=None), ev("wish_submitted", {"text": "x"}, step=None),
    ev("options_shown", {"move_ids": ["a", "b", "c"], "reroll_index": 0}),
    ev("options_rejected", {"reason_chip": "too big", "move_ids": ["a", "b", "c"]}),
    ev("options_shown", {"move_ids": ["d", "b2", "c2"], "reroll_index": 1}),
    ev("move_locked", {"move_id": "d", "position": 0, "ms_since_shown": 4000, "reroll_index": 1}),
    ev("classification_confirmed", {"changed": False}, step=None),
    ev("path_completed", {"move_ids": ["d"]}, step=None), ev("path_rated", {"rating": 4}, step=None),
    ev("would_do_this_week", {"answer": "yes"}, step=None), ev("open_feedback", {"text": "nice"}, step=None),
]


def test_funnel():
    assert [x["n"] for x in funnel(LOG)] == [1, 1, 1, 1, 0, 0, 1]


def test_leaderboard():
    lb = leaderboard(LOG, {})
    d = next(r for r in lb if r["id"] == "d")
    assert (d["shown"], d["picked"], d["pickRate"], d["medianDecisionMs"], d["pickRatePos1"]) == (1, 1, 1, 4000, 1)
    a = next(r for r in lb if r["id"] == "a")
    assert (a["shown"], a["picked"], a["rejected"]) == (1, 0, 1)


def test_reject_reasons_and_classifier():
    assert reject_reasons(LOG) == {"1": {"too big": 1}}
    assert classifier_accuracy(LOG) == {"total": 1, "kept": 1, "pct": 100}


def test_choices_rows():
    rows = choices_rows(LOG, WISHES)
    assert len(rows) == 2
    assert rows[0]["reject_reason"] == "too big" and rows[0]["chosen_id"] == ""
    assert (rows[1]["chosen_id"], rows[1]["chosen_position"], rows[1]["reroll_index"], rows[1]["wish"], rows[1]["archetype"]) == ("d", 0, 1, "Learn DevOps", "builder")


def test_feedback_rows_and_key_numbers():
    r = feedback_rows(LOG, WISHES)[0]
    assert (r["rating"], r["would_do_this_week"], r["open_feedback"]) == (4, "yes", "nice")
    k = key_numbers(LOG)
    assert (k["sessions"], k["avgRating"], k["rerollRate"]) == (1, 4, 50)


def test_csv_escapes_and_bom():
    c = to_csv([{"a": 'x,"y"', "b": {"k": 1}}])
    assert c.startswith("﻿") and '"x,""y"""' in c and '"{""k"":1}"' in c


def test_journeys():
    [j] = journeys([*LOG, ev("options_feedback", {"answer": "somewhat"}), ev("step_skipped", step=2), ev("options_shown", {"move_ids": ["x"]}, step=2)], WISHES)
    assert (j["sessionId"], j["participant"]) == ("s1", "P01")
    w = j["wishes"][0]
    assert (w["text"], w["archetype"], w["classifierChanged"], w["rating"], w["wouldDo"], w["openFeedback"], w["path"]) == ("Learn DevOps", "builder", False, 4, "yes", "nice", ["d"])
    assert [r["outcome"] for r in w["steps"][0]["rounds"]] == [{"kind": "rejected", "reason": "too big"}, {"kind": "picked", "moveId": "d", "position": 0, "ms": 4000}]
    assert w["steps"][0]["useful"] == "somewhat"
    assert w["steps"][1]["rounds"] == [{"reroll": 0, "moveIds": ["x"], "outcome": {"kind": "open"}}]


def test_journeys_separate_sessions():
    js = journeys([ev("wish_submitted", sessionId="a", wishId="wa", step=None), ev("wish_submitted", sessionId="b", wishId="wb", step=None)], [])
    assert [j["sessionId"] for j in js] == ["b", "a"]


def test_batch_ordered_by_client_time():
    at = datetime.fromtimestamp(1_800_000_000, timezone.utc)
    c = lambda n: datetime.fromtimestamp(1_800_000_000 + n / 1000, timezone.utc)  # noqa: E731
    batch = [ev("move_locked", {"move_id": "a", "position": 0}, createdAt=at, clientTs=c(2)), ev("options_shown", {"move_ids": ["a", "b", "c"]}, createdAt=at, clientTs=c(1))]
    o = journeys(batch, WISHES)[0]["wishes"][0]["steps"][0]["rounds"][0]["outcome"]
    assert o["kind"] == "picked" and o["moveId"] == "a"
    assert len(choices_rows(batch, WISHES)) == 1
