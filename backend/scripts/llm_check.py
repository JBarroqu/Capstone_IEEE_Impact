"""Usage: npm run llm:check -- ["wish text"] [--all]
Prints the model chain, then classifies the wish, writes follow-up questions and generates move 1 through it (as the app does).
--all also pings every model on its own, so you can see which ones are up right now."""
import asyncio
import json
import sys
import time

from wish_api.config import config
from wish_api.prompts.classify_v1 import build_classify_prompt, classify_json_schema, parse_classify
from wish_api.prompts.questions_v1 import QUESTIONS_TEMPERATURE, build_questions_prompt, parse_questions, questions_json_schema
from wish_api.providers.backends import get_backends
from wish_api.providers.health import Health
from wish_api.providers.llm import chain_options, run_chain
from wish_api.providers.run import LlmTask
from wish_api.providers.validate import RawMove

args = sys.argv[1:]
check_all = "--all" in args
wish = next((a for a in args if not a.startswith("--")), "Turn my capstone into a portfolio piece")
classify_task = LlmTask(schema=classify_json_schema, build=lambda h: build_classify_prompt(wish, h), parse=parse_classify)


async def main() -> int:
    backends = await get_backends()
    print(f"MOVE_PROVIDER={config.provider}; chain ({len(backends)}):")
    for i, b in enumerate(backends):
        print(f"  {i + 1}. {b.id}")
    if not backends:
        print("No models available. Set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY, or start Ollama.")
        return 1

    if check_all:
        print("\nPinging each model (classification prompt):")
        for b in backends:
            t = time.monotonic()
            try:
                r = await run_chain(classify_task, backends=lambda b=b: _one(b), preferred=_none, health=Health(), budget_ms=config.llm_timeout_ms)
                print(f"  OK    {b.id} {round((time.monotonic() - t) * 1000)}ms {json.dumps(r.value)}")
            except Exception as e:
                print(f"  FAIL  {b.id} {round((time.monotonic() - t) * 1000)}ms {str(e)[:140]}")

    ok = True
    cls = {"focus": ["advance"], "domains": ["technical", "career"], "type": "open_ended"}
    try:
        c = await run_chain(classify_task)
        cls = c.value
        skipped = f" (skipped {', '.join(t['id'] + ':' + t['reason'] for t in c.tried)})" if c.tried else ""
        print(f"\nclassified by {c.backend.id} in {c.latency_ms}ms: {json.dumps(cls)}{skipped}")
    except Exception as e:
        ok = False
        print(f"\nclassify FAILED: {e}")

    # Follow-up questions, answered with the second option each time (as a stand-in student).
    base = {"wishText": wish, **cls, "why": "I want it to help me get a new-grad offer", "prior": {"chips": ["online course"]}}
    follow_ups = []
    try:
        q = await run_chain(LlmTask(schema=questions_json_schema, temperature=QUESTIONS_TEMPERATURE,
                                    build=lambda h: build_questions_prompt(base, h), parse=parse_questions))
        print(f"\nquestions by {q.backend.id} in {q.latency_ms}ms:")
        for x in q.value:
            labels = " | ".join(f"[{a['label']}]" if i == 1 else a["label"] for i, a in enumerate(x["answers"]))
            print(f"  {x['prompt']}\n    {labels}   ({x['note']})")
        follow_ups = [{"question": x["prompt"], "answer": x["answers"][1]["label"], "note": x["note"]} for x in q.value]
    except Exception as e:
        ok = False
        print(f"\nquestions FAILED: {e}")

    req = {"ctx": {**base, "followUps": follow_ups, "chosen": []}, "step": 1, "excludeIds": [], "rerollIndex": 0}
    try:
        r = await chain_options(req)
        print("")
        for i, m in enumerate(r["moves"]):
            print(f"{i + 1}. [{m['cost']}, {m['minutes']}m, {m['format']}] {m['title']}\n   {m['detail']}")
        valid = len(r["moves"]) == 3 and all(_valid(m) for m in r["moves"])
        meta = r["meta"]
        skipped = f" skipped={', '.join(meta['tried'])}" if meta.get("tried") else ""
        print(f"\nmoves by {meta['usedProvider']}:{meta['model']} in {meta['latencyMs']}ms repaired={str(meta['repaired']).lower()}{skipped}")
        print(f"validation: {'PASS' if valid else 'FAIL'}")
        ok = ok and valid
    except Exception as e:
        ok = False
        print(f"\nmoves FAILED: {e}")
    return 0 if ok else 1


def _valid(m: dict) -> bool:
    try:
        RawMove.model_validate(m)
        return True
    except Exception:
        return False


async def _one(b):
    return [b]


async def _none():
    return None


sys.exit(asyncio.run(main()))
