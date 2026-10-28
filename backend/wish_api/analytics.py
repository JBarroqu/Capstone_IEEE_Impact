"""Pure stat/CSV-row functions over event rows (port of lib/analytics.ts; outputs must stay identical).

An event row is a dict: id, createdAt, clientTs (datetimes), sessionId, wishId, participantCode, provider, name, step, payload.
A wish row: id, sessionId, text, type, focus, domains, archetype, why.
Move meta: id -> {id, title, step, focus, cost, source}.
"""
import math

from .jsutil import is_num, js_iso, js_json, js_number, js_round, js_str, num


def _median(a: list[float]):
    if not a:
        return None
    s = sorted(a)
    m = len(s) // 2
    return num(s[m]) if len(s) % 2 else js_round((s[m - 1] + s[m]) / 2)


def _avg(a: list[float]):
    return num(js_round(sum(a) / len(a) * 100) / 100) if a else None


def _count(xs: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for x in xs:
        out[x] = out.get(x, 0) + 1
    return out


def _key(v) -> str:
    """A value used as a JS object key."""
    return js_str(v) if not isinstance(v, str) else v


def _sessions_with(ev: list[dict], name: str, pred=lambda e: True) -> int:
    return len({e["sessionId"] for e in ev if e["name"] == name and pred(e)})


def _ratio(a: float, b: float):
    return js_round(a / b * 1000) / 1000 if b else None


def funnel(ev: list[dict]) -> list[dict]:
    return [
        {"label": "Sessions", "n": _sessions_with(ev, "session_started")},
        {"label": "Consented", "n": _sessions_with(ev, "consent_given")},
        {"label": "Wish submitted", "n": _sessions_with(ev, "wish_submitted")},
        {"label": "Move 1 locked", "n": _sessions_with(ev, "move_locked", lambda e: e["step"] == 1)},
        {"label": "Move 2 locked", "n": _sessions_with(ev, "move_locked", lambda e: e["step"] == 2)},
        {"label": "Move 3 locked", "n": _sessions_with(ev, "move_locked", lambda e: e["step"] == 3)},
        {"label": "Path rated", "n": _sessions_with(ev, "path_rated")},
    ]


def leaderboard(ev: list[dict], meta: dict[str, dict]) -> list[dict]:
    acc: dict[str, dict] = {}

    def get(id: str) -> dict:
        return acc.setdefault(id, {"shown": 0, "picked": 0, "rejected": 0, "ms": [], "posShown": [0, 0, 0], "posPicked": [0, 0, 0]})

    for e in ev:
        p = e["payload"]
        if e["name"] == "options_shown":
            for i, id in enumerate(p.get("move_ids") or []):
                a = get(id)
                a["shown"] += 1
                if i < 3:
                    a["posShown"][i] += 1
        elif e["name"] == "move_locked" and p.get("move_id"):
            a = get(p["move_id"])
            a["picked"] += 1
            if is_num(p.get("ms_since_shown")):
                a["ms"].append(p["ms_since_shown"])
            if is_num(p.get("position")) and 0 <= p["position"] < 3:
                a["posPicked"][int(p["position"])] += 1
        elif e["name"] == "options_rejected":
            for id in p.get("move_ids") or []:
                get(id)["rejected"] += 1
    rows = []
    for id, a in acc.items():
        m = meta.get(id)
        rows.append({
            "id": id, "title": m["title"] if m else id,
            "source": m["source"] if m else ("generated" if id.startswith("gen-") else "catalog"),
            "step": m.get("step") if m else None, "focus": "|".join(m.get("focus") or []) if m else "", "cost": (m.get("cost") or "") if m else "",
            "shown": a["shown"], "picked": a["picked"], "pickRate": num(_ratio(a["picked"], a["shown"]) or 0),
            "rejected": a["rejected"], "medianDecisionMs": _median(a["ms"]),
            "pickRatePos1": _num_or_none(_ratio(a["posPicked"][0], a["posShown"][0])),
            "pickRatePos2": _num_or_none(_ratio(a["posPicked"][1], a["posShown"][1])),
            "pickRatePos3": _num_or_none(_ratio(a["posPicked"][2], a["posShown"][2])),
        })
    return sorted(rows, key=lambda r: (-r["pickRate"], -r["shown"], r["id"]))


def _num_or_none(x):
    return None if x is None else num(x)


def reject_reasons(ev: list[dict]) -> dict:
    out: dict[str, dict[str, int]] = {}
    for e in ev:
        if e["name"] != "options_rejected":
            continue
        step = js_str(e["step"]) if e["step"] is not None else "?"
        p = e["payload"]
        reason = _key(p.get("reason_chip") or ("other" if p.get("text") else "none"))
        d = out.setdefault(step, {})
        d[reason] = d.get(reason, 0) + 1
    return out


def classifier_accuracy(ev: list[dict]) -> dict:
    c = [e for e in ev if e["name"] == "classification_confirmed"]
    kept = len([e for e in c if e["payload"].get("changed") is False])
    return {"total": len(c), "kept": kept, "pct": js_round(kept / len(c) * 100) if c else None}


def feedback(ev: list[dict], wishes: list[dict]) -> dict:
    wish_text = {w["id"]: w["text"] for w in wishes}
    by = lambda name: [e for e in ev if e["name"] == name]  # noqa: E731
    useful: dict[str, dict[str, int]] = {}
    for e in by("options_feedback"):
        s = js_str(e["step"]) if e["step"] is not None else "?"
        k = _key(e["payload"].get("answer"))
        d = useful.setdefault(s, {})
        d[k] = d.get(k, 0) + 1
    paid: dict[str, dict[str, int]] = {}
    for e in by("paid_willingness"):
        id = _key(e["payload"].get("move_id") or "?")
        k = _key(e["payload"].get("answer"))
        d = paid.setdefault(id, {})
        d[k] = d.get(k, 0) + 1
    ratings = [js_number(e["payload"].get("rating")) for e in by("path_rated")]
    return {
        "avgRating": _avg([n for n in ratings if not math.isnan(n)]),
        "ratings": len(by("path_rated")),
        "wouldDoThisWeek": _count([js_str(e["payload"].get("answer")) for e in by("would_do_this_week")]),
        "paidWillingness": paid,
        "optionsUseful": useful,
        "openText": [{"text": js_str(e["payload"]["text"]), "wish": (e["wishId"] and wish_text.get(e["wishId"])) or ""}
                     for e in by("open_feedback") if e["payload"].get("text")],
    }


def _pct(a: float, b: float):
    return js_round(a / b * 100) if b else None


def key_numbers(ev: list[dict]) -> dict:
    """Key numbers used for the side-by-side provider comparisons."""
    f = funnel(ev)
    fb = feedback(ev, [])
    shown = [e for e in ev if e["name"] == "options_shown"]
    fallbacks = len([e for e in ev if e["name"] == "provider_fallback"])
    failed = len([e for e in ev if e["name"] == "options_failed"])
    lat = [n for n in (js_number(e["payload"].get("latency_ms")) for e in shown) if not math.isnan(n)]
    locked = len([e for e in ev if e["name"] == "move_locked"])
    rejected = len([e for e in ev if e["name"] == "options_rejected"])
    return {
        "sessions": f[0]["n"], "completedRated": f[6]["n"],
        "completionRate": _pct(f[6]["n"], f[0]["n"]),
        "avgRating": fb["avgRating"], "wouldDoThisWeek": fb["wouldDoThisWeek"],
        "optionsUseful": _count([js_str(e["payload"].get("answer")) for e in ev if e["name"] == "options_feedback"]),
        "medianLatencyMs": _median(lat), "failedRate": _pct(failed, len(shown) + failed), "fallbackRate": _pct(fallbacks, len(shown)),
        "rerollRate": _pct(rejected, locked + rejected),
        "classifierAccuracyPct": classifier_accuracy(ev)["pct"],
    }


def group_by(ev: list[dict], key, f) -> dict:
    g: dict[str, list[dict]] = {}
    for e in ev:
        g.setdefault(key(e), []).append(e)
    return {k: f(v) for k, v in sorted(g.items(), key=lambda kv: kv[0])}


def _t(e: dict) -> float:
    """Client time orders events: one batch is inserted with a single server createdAt."""
    return (e.get("clientTs") or e["createdAt"]).timestamp() * 1000


def choices_rows(ev: list[dict], wishes: list[dict]) -> list[dict]:
    """One row per decision (a set of shown options and its outcome)."""
    wm = {w["id"]: w for w in wishes}
    open_: dict[str, dict] = {}
    rows: list[dict] = []

    def base(shown: dict) -> dict:
        w = wm.get(shown["wishId"]) if shown["wishId"] else None
        p = shown["payload"]
        return {
            "session": shown["sessionId"], "participant": shown["participantCode"],
            "provider": p["used_provider"] if p.get("used_provider") is not None else shown["provider"],
            "wish": w["text"] if w else "", "focus": "|".join(w.get("focus") or []) if w else "",
            "domain": "|".join(w.get("domains") or []) if w else "", "archetype": (w.get("archetype") or "") if w else "",
            "step": shown["step"], "shown_ids": "|".join(p.get("move_ids") or []),
            "reroll_index": p["reroll_index"] if p.get("reroll_index") is not None else 0,
        }

    for e in sorted(ev, key=_t):
        k = f"{e['sessionId']}|{_jsv(e['wishId'])}|{_jsv(e['step'])}"
        if e["name"] == "options_shown":
            open_[k] = e
            continue
        shown = open_.get(k)
        if not shown:
            continue
        p = e["payload"]
        if e["name"] == "move_locked":
            rows.append({**base(shown), "chosen_id": p.get("move_id"), "chosen_position": p.get("position"), "decision_ms": p.get("ms_since_shown"), "reject_reason": ""})
        elif e["name"] == "options_rejected":
            reason = ": ".join(js_str(x) for x in [p.get("reason_chip"), p.get("text")] if x)
            rows.append({**base(shown), "chosen_id": "", "chosen_position": "", "decision_ms": "", "reject_reason": reason})
        elif e["name"] == "step_skipped":
            rows.append({**base(shown), "chosen_id": "", "chosen_position": "", "decision_ms": "", "reject_reason": "skipped"})
        else:
            continue
        del open_[k]
    return rows


def _jsv(v) -> str:
    """Template-literal interpolation of a nullable value."""
    return "null" if v is None else js_str(v)


def feedback_rows(ev: list[dict], wishes: list[dict]) -> list[dict]:
    """One row per completed path with all feedback fields."""
    wm = {w["id"]: w for w in wishes}
    rows = []
    for done in [e for e in ev if e["name"] == "path_completed"]:
        same = [e for e in ev if e["sessionId"] == done["sessionId"] and e["wishId"] == done["wishId"]]
        one = lambda n: next((e["payload"] for e in same if e["name"] == n), None)  # noqa: E731,B023
        w = wm.get(done["wishId"]) if done["wishId"] else None
        rated, would, opn = one("path_rated"), one("would_do_this_week"), one("open_feedback")
        rows.append({
            "session": done["sessionId"], "participant": done["participantCode"], "provider": done["provider"],
            "wish": w["text"] if w else "", "why": (w.get("why") or "") if w else "", "archetype": (w.get("archetype") or "") if w else "",
            "path": "|".join(done["payload"].get("move_ids") or []),
            "rating": _or_blank(rated, "rating"), "would_do_this_week": _or_blank(would, "answer"),
            "paid_willingness": "|".join(f"{_jsv(e['payload'].get('move_id', None) if 'move_id' in e['payload'] else 'undefined')}:{_jsv(e['payload'].get('answer')) if 'answer' in e['payload'] else 'undefined'}" for e in same if e["name"] == "paid_willingness"),
            "open_feedback": _or_blank(opn, "text"),
        })
    return rows


def _or_blank(payload: dict | None, k: str):
    """payload?.[k] ?? "" """
    if payload is None or payload.get(k) is None:
        return ""
    return payload[k]


def events_rows(ev: list[dict]) -> list[dict]:
    return [{
        "id": e.get("id"), "created_at": js_iso(e["createdAt"]), "session_id": e["sessionId"], "wish_id": e["wishId"],
        "participant_code": e["participantCode"], "provider": e["provider"], "name": e["name"], "step": e["step"],
        "payload": js_json(e["payload"]),
    } for e in ev]


def journeys(ev: list[dict], wishes: list[dict]) -> list[dict]:
    """One entry per session: each wish, the options shown at every step, what the student did with them, and their feedback."""
    wm = {w["id"]: w for w in wishes}
    by_session: dict[str, list[dict]] = {}
    for e in sorted(ev, key=_t):
        by_session.setdefault(e["sessionId"], []).append(e)

    out = []
    for session_id, se in by_session.items():
        wish_ids = list(dict.fromkeys(e["wishId"] for e in se if e["wishId"]))
        wj = []
        for wish_id in wish_ids:
            we = [e for e in se if e["wishId"] == wish_id]

            def one(n: str, we=we):
                return next((e["payload"] for e in reversed(we) if e["name"] == n), None)

            w = wm.get(wish_id)
            steps: dict[int, dict] = {}
            for e in we:
                if e["step"] is None:
                    continue
                s = steps.setdefault(e["step"], {"step": e["step"], "rounds": [], "failed": 0, "useful": None})
                cur = s["rounds"][-1] if s["rounds"] else None

                def close(o, cur=cur):
                    if cur and cur["outcome"]["kind"] == "open":
                        cur["outcome"] = o

                p = e["payload"]
                if e["name"] == "options_shown":
                    s["rounds"].append({"reroll": num(js_number(p.get("reroll_index") if p.get("reroll_index") is not None else 0)), "moveIds": p.get("move_ids") or [], "outcome": {"kind": "open"}})
                elif e["name"] == "move_locked":
                    close({"kind": "picked", "moveId": p.get("move_id"), "position": p.get("position"), "ms": p.get("ms_since_shown")})
                elif e["name"] == "options_rejected":
                    close({"kind": "rejected", "reason": ": ".join(js_str(x) for x in [p.get("reason_chip"), p.get("text")] if x) or "no reason"})
                elif e["name"] == "step_skipped":
                    close({"kind": "skipped"})
                elif e["name"] == "options_failed":
                    s["failed"] += 1
                elif e["name"] == "options_feedback":
                    s["useful"] = js_str(p.get("answer")) if "answer" in p else "undefined"
            rated = one("path_rated")
            rating = js_number(rated.get("rating")) if rated and "rating" in rated else math.nan
            qs = one("questions_shown")
            answered = {e["payload"].get("q"): js_str(e["payload"]["answer_text"] if e["payload"].get("answer_text") is not None else e["payload"].get("answer"))
                        for e in we if e["name"] == "quiz_answered"}
            submitted, assigned, confirmed = one("wish_submitted"), one("archetype_assigned"), one("classification_confirmed")
            completed, would, opn = one("path_completed"), one("would_do_this_week"), one("open_feedback")
            wj.append({
                "wishId": wish_id,
                "text": w["text"] if w and w.get("text") is not None else ((submitted or {}).get("text") if (submitted or {}).get("text") is not None else ""),
                "why": (w.get("why") or "") if w else "",
                "archetype": w["archetype"] if w and w.get("archetype") is not None else ((assigned or {}).get("archetype") if (assigned or {}).get("archetype") is not None else ""),
                "focus": (w.get("focus") or []) if w else [], "domains": (w.get("domains") or []) if w else [],
                "classifierChanged": (confirmed or {}).get("changed") if (confirmed or {}).get("changed") is not None else None,
                "questions": {
                    "source": js_str(qs.get("source")), "skipped": one("quiz_skipped") is not None,
                    "items": [{"question": q["prompt"], "answer": answered.get(q["id"])} for q in qs.get("questions") or []],
                } if qs else None,
                "steps": sorted(steps.values(), key=lambda s: s["step"]),
                "path": (completed or {}).get("move_ids"),
                "rating": None if math.isnan(rating) else num(rating),
                "wouldDo": (would or {}).get("answer"),
                "paid": [{"moveId": e["payload"].get("move_id"), "answer": js_str(e["payload"].get("answer"))} for e in we if e["name"] == "paid_willingness"],
                "openFeedback": (opn or {}).get("text") or None,
            })
        out.append({
            "sessionId": session_id, "participant": se[0]["participantCode"],
            "provider": next((e["provider"] for e in se if e["provider"]), None),
            "started": _t(se[0]), "lastSeen": _t(se[-1]), "wishes": wj,
        })
    out.sort(key=lambda j: -j["started"])
    for j in out:
        j["started"], j["lastSeen"] = _iso_ms(j["started"]), _iso_ms(j["lastSeen"])
    return out


def _iso_ms(ms: float) -> str:
    from datetime import datetime, timezone

    return js_iso(datetime.fromtimestamp(ms / 1000, timezone.utc).replace(microsecond=int(ms % 1000) * 1000))
