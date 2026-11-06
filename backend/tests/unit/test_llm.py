"""Model chain, validation, prompts and questions (no live model calls)."""
import asyncio
import json
import re
import time

import pytest

from app.modules.wish.prompts.moves_v5 import MOVES_TEMPERATURE, build_prompt
from app.modules.wish.prompts.questions_v1 import build_questions_prompt, parse_questions
from app.llm.backends import Backend, rank_gemini_models
from app.llm.errors import LlmUnavailable, QueueTimeout, RateLimited
from app.llm.health import Health
from app.modules.wish.movegen import chain_options, gen_id
from app.llm.queue import RateQueue
from app.llm.validate import ValidationError
from app.modules.wish.prompts.classify_v1 import parse_classify

REQ = {
    "ctx": {"wishText": "Pass technical interviews", "type": "fixed", "focus": ["goal"], "domains": ["career"], "prior": {"chips": []}, "chosen": []},
    "step": 1, "excludeIds": [], "rerollIndex": 0,
    "skills": [{"id": "sql", "name": "SQL"}, {"id": "python", "name": "Python"}],
}


def mv(title, cost="free"):
    return {"title": title, "detail": "Do the specific thing today.", "step": 1, "focus": ["goal"], "domains": ["career"], "minutes": 30, "cost": cost, "format": "solo",
            "activityType": "create", "difficulty": "moderate", "skillId": "sql"}


def js(*m):
    return json.dumps({"moves": list(m)})


def good(p="Ok"):
    return js(mv(f"{p} one"), mv(f"{p} two"), mv(f"{p} three"))


def backend(id, gen):
    async def generate(system, user, schema, temperature=0.4):
        return await gen()
    return Backend(id=f"gemini:{id}", provider="gemini", model=id, remote=True, generate=generate)


async def hang():
    await asyncio.sleep(3600)


def chain(backends, timeout_ms=500, budget_ms=5000, health=None):
    async def bs():
        return backends

    async def none():
        return None
    opts = dict(backends=bs, preferred=none, health=health or Health(), timeout_ms=timeout_ms, budget_ms=budget_ms)
    return lambda req=REQ: chain_options(req, **opts)


def provider(gen, timeout_ms=500):
    n = {"i": 0}

    async def g():
        i = n["i"]
        n["i"] += 1
        return await gen(i)
    return chain([backend("test-model", g)], timeout_ms)


async def test_valid_json_path():
    async def g(n): return js(mv("Do a timed mock"), mv("Drill graphs"), mv("Review DP notes"))
    r = await provider(g)()
    assert r["meta"]["usedProvider"] == "gemini" and len(r["moves"]) == 3
    assert all(m["id"].startswith("gen-") for m in r["moves"])
    assert r["meta"]["sources"] == ["generated"] * 3 and r["meta"]["repaired"] is False


async def test_malformed_json_retry_same_model():
    async def g(n): return "not json" if n == 0 else js(mv("A one"), mv("B two"), mv("C three"))
    r = await provider(g)()
    assert r["meta"]["usedProvider"] == "gemini" and r["meta"]["repaired"] is True


async def test_malformed_every_attempt_fails_loudly():
    async def g(n): return "nope"
    with pytest.raises(LlmUnavailable) as e:
        await provider(g)()
    assert e.value.reason == "invalid_json"


async def test_two_paid_retried_with_hint():
    calls = {"n": 0}

    async def g(n):
        calls["n"] += 1
        return js(mv("Paid one", "paid"), mv("Paid two", "paid"), mv("Free one")) if n == 0 else js(mv("Free a"), mv("Free b"), mv("Paid c", "paid"))
    r = await provider(g)()
    assert calls["n"] == 2
    assert len([m for m in r["moves"] if m["cost"] == "paid"]) <= 1
    assert len([m for m in r["moves"] if m["cost"] == "free"]) >= 2
    assert r["meta"]["repaired"] is True


async def test_duplicate_titles_filtered():
    async def g(n): return js(mv("Same title"), mv("same  Title!"), mv("Other move")) if n == 0 else js(mv("Fresh a"), mv("Fresh b"), mv("Fresh c"))
    r = await provider(g)()
    assert len({re.sub(r"[^a-z ]", "", m["title"].lower()) for m in r["moves"]}) == 3


async def test_truncates_title_and_detail():
    long = {**mv("x" * 90), "detail": "First sentence. Second sentence."}

    async def g(n): return js(long, mv("Two"), mv("Three"))
    r = await provider(g)()
    m = next(m for m in r["moves"] if m["title"].startswith("xxx"))
    assert len(m["title"]) <= 60 and m["detail"] == "First sentence."


async def test_every_model_times_out():
    with pytest.raises(LlmUnavailable) as e:
        await chain([backend("a", hang), backend("b", hang)], timeout_ms=30)()
    assert e.value.reason == "timeout"


async def test_hung_model_skipped():
    async def fast(): return good("Next")
    r = await chain([backend("slow", hang), backend("fast", fast)], timeout_ms=50)()
    assert r["meta"]["model"] == "fast" and r["meta"]["tried"] == ["gemini:slow:timeout"]


async def test_503_next_model_and_sick_one_skipped():
    h, sick = Health(), {"n": 0}

    async def busy():
        sick["n"] += 1
        raise RuntimeError('{"error":{"code":503,"status":"UNAVAILABLE"}}')

    async def okb(): return good()
    p = chain([backend("busy", busy), backend("ok", okb)], health=h)
    assert (await p())["meta"]["model"] == "ok"
    assert (await p())["meta"]["model"] == "ok"
    assert sick["n"] == 1 and h.cooling("gemini:busy")


async def test_rate_limited_everywhere():
    async def rl(): raise RateLimited("429")
    with pytest.raises(LlmUnavailable) as e:
        await chain([backend("a", rl), backend("b", rl)])()
    assert e.value.reason == "rate_limited"


async def test_retired_model_parked():
    h = Health()

    async def old(): raise RuntimeError("404 models/old is not found")

    async def okb(): return good()
    assert (await chain([backend("old", old), backend("ok", okb)], health=h)())["meta"]["model"] == "ok"
    assert h.get("gemini:old").gone


async def test_invalid_twice_moves_on():
    async def bad(): return "nope"

    async def okb(): return good()
    r = await chain([backend("bad", bad), backend("ok", okb)])()
    assert r["meta"]["model"] == "ok" and r["meta"]["tried"] == ["gemini:bad:invalid_json"]


async def test_stops_at_budget():
    t = time.monotonic()
    with pytest.raises(LlmUnavailable):
        await chain([backend("a", hang), backend("b", hang), backend("c", hang)], timeout_ms=400, budget_ms=600)()
    assert time.monotonic() - t < 1.5


async def test_no_models():
    with pytest.raises(LlmUnavailable):
        await chain([])()


def test_health_order():
    class B:
        def __init__(self, id): self.id = id
    h, bs = Health(), [B("a"), B("b"), B("c")]
    assert [b.id for b in h.order(bs, "c")] == ["c", "a", "b"]
    h.fail("a", "error", "503")
    assert [b.id for b in h.order(bs, None)] == ["b", "c", "a"]


def test_gen_id():
    assert gen_id("Do a Mock!", 1) == gen_id("do a  mock", 1)
    assert gen_id("Do a mock", 1) != gen_id("Do a mock", 2)


async def test_no_cache_every_request_hits_model():
    calls = {"n": 0}

    async def g():
        calls["n"] += 1
        return js(mv("One a"), mv("Two b"), mv("Three c"))

    b = backend("m", g)

    async def bs(): return [b]

    async def none(): return None
    kw = dict(backends=bs, preferred=none, health=Health(), timeout_ms=500, budget_ms=5000)
    await chain_options(REQ, **kw)
    r = await chain_options(REQ, **kw)
    assert calls["n"] == 2 and r["meta"]["cacheHit"] is False


def test_prompt_has_style_example_but_no_fixed_moves():
    p = build_prompt({**REQ, "ctx": {**REQ["ctx"], "wishText": "Learn DevOps"}})
    assert "Style example" in p["user"]
    assert not re.search(r"AWS|Azure|GCP|cloud lane|gold-standard|Worked path|Catalog", p["system"] + "\n" + p["user"], re.I)


async def test_exclude_titles_in_prompt_and_dropped():
    r = {**REQ, "excludeTitles": ["Two b"]}
    assert "Two b" in build_prompt(r)["user"]

    async def g(n): return js(mv("One a"), mv("Two b"), mv("Three c")) if n == 0 else js(mv("One a"), mv("Four d"), mv("Three c"))
    out = await provider(g)(r)
    assert "Two b" not in [m["title"] for m in out["moves"]]


async def test_moves_temperature():
    seen = []

    async def generate(system, user, schema, temperature=None):
        seen.append(temperature)
        return good()
    await chain([Backend(id="gemini:t", provider="gemini", model="t", remote=True, generate=generate)])()
    assert seen == [MOVES_TEMPERATURE]


async def test_queue_rejects_when_wait_too_long():
    q = RateQueue(1)
    await q.acquire(10)
    with pytest.raises(QueueTimeout):
        await q.acquire(10)


def test_rank_gemini_models():
    assert rank_gemini_models([
        "models/gemini-2.5-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite-preview",
        "models/gemini-3.8-flash", "models/gemini-3.8-flash-tts", "models/gemini-3.1-flash-image", "models/gemini-flash-lite-latest",
        "models/gemini-2.5-pro", "models/gemma-3-27b-it", "models/text-embedding-004",
    ]) == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest",
           "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-pro"]


def test_parse_classify_dedupes():
    assert parse_classify('{"focus":["learn","learn","goal"],"domains":["technical"],"type":"fixed"}') == {"focus": ["learn", "goal"], "domains": ["technical"], "type": "fixed"}
    with pytest.raises(ValidationError):
        parse_classify('{"focus":[],"domains":["technical"],"type":"fixed"}')


Q = lambda prompt, answers=("Not started", "Some progress", "Nearly there"): {"prompt": prompt, "answers": list(answers), "note": "how far along"}  # noqa: E731


def test_questions_parse_positional_ids():
    s = parse_questions(json.dumps({"questions": [Q("How far along are you?"), Q("How many hours a week can you give this?"), Q("What has blocked you so far?")]}))
    assert [x["id"] for x in s] == ["g1", "g2", "g3"] and [a["id"] for a in s[0]["answers"]] == ["a", "b", "c"]


def test_questions_reject_too_few_or_duplicates():
    with pytest.raises(ValidationError):
        parse_questions(json.dumps({"questions": [Q("Only one question here?")]}))
    with pytest.raises(ValidationError, match="duplicate"):
        parse_questions(json.dumps({"questions": [Q("How far along are you?", ["Yes", "yes", "No"]), Q("Second question here?"), Q("Third question here?")]}))


def test_questions_prompt_and_follow_ups_in_moves_prompt():
    p = build_questions_prompt({**REQ["ctx"], "why": "graduating in May"})
    assert "Pass technical interviews" in p["user"] and "graduating in May" in p["user"]
    assert "Do not suggest moves, tools or resources" in p["system"]
    fu = [{"question": "How far along are you?", "answer": "Some progress", "note": "x"}]
    assert "How far along are you? → Some progress" in build_prompt({**REQ, "ctx": {**REQ["ctx"], "followUps": fu}})["user"]


async def test_unknown_skill_id_is_retried():
    """D-08/D-11: a move tagged with a skill outside the allowed list is invalid; the model is asked again."""
    async def g(n):
        bad = {**mv("Off list"), "skillId": "cooking"}
        return js(bad, mv("B two"), mv("C three")) if n == 0 else good("Fixed")
    r = await provider(g)()
    assert r["meta"]["repaired"] is True and {m["skillId"] for m in r["moves"]} == {"sql"}


async def test_moves_carry_scoring_tags():
    async def g(n): return good()
    r = await provider(g)()
    assert all(m["activityType"] == "create" and m["difficulty"] == "moderate" and m["skillId"] == "sql" for m in r["moves"])


def test_profile_and_outcomes_in_prompt():
    req = {**REQ, "step": 2, "profile": {"targetCareer": "Data Analyst", "skills": ["SQL", "pandas"], "growthAreas": ["statistics"]},
           "outcomes": [{"step": 1, "title": "Publish one SQL analysis", "status": "validated", "aiScore": 0.8,
                         "feedbackSummary": "Clear queries", "buddyComment": "Works"}]}
    u = build_prompt(req)["user"]
    assert "Target career: Data Analyst" in u and "Growth areas (aim here): statistics" in u
    assert "rubric score 0.80" in u and "buddy said: Works" in u
    assert "sql = SQL" in u
    # name / bio never appear unless PROFILE_IN_MOVES=full put them in the profile dict
    assert "Test Student" not in u
