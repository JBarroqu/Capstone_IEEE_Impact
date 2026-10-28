from typing import Awaitable, Callable

from ..config import config
from ..prompts.moves_v4 import MOVES_TEMPERATURE, PROMPT_VERSION, build_prompt, moves_json_schema
from .backends import Backend, get_backends
from .health import Health, health as shared_health
from .prefs import get_preferred_backend
from .run import LlmTask, RunResult, run_llm
from .validate import ValidationError, normalize_title, parse_model_json, repair_moves


async def run_chain(task: LlmTask, *, backends: Callable[[], Awaitable[list[Backend]]] | None = None,
                    preferred: Callable[[], Awaitable[str | None]] | None = None, health: Health | None = None,
                    timeout_ms: float | None = None, budget_ms: float | None = None) -> RunResult:
    """Run any task through the model chain with production defaults (overridable for tests)."""
    bs = await (backends or get_backends)()
    try:
        pref = await (preferred or get_preferred_backend)()
    except Exception:
        pref = None
    return await run_llm(task, backends=bs, preferred=pref, health=health or shared_health,
                         timeout_ms=timeout_ms or config.llm_timeout_ms, budget_ms=budget_ms or config.llm_budget_ms)


def assemble(req: dict, raws) -> tuple[list[dict], bool]:
    """Clean up model output. Raises ValidationError (-> retry with the message as a hint) if it can't make 3 valid moves."""
    seen = {normalize_title(t) for t in req.get("excludeTitles") or []}
    seen |= {normalize_title(m["title"]) for m in req.get("rejectedMoves") or []}
    seen |= {normalize_title(m["title"]) for m in req["ctx"]["chosen"]}
    out, did_repair = repair_moves(raws, req["step"], seen)
    if (req.get("rejectReason") or {}).get("chip") == "don't want to pay":
        free = [m for m in out if m["cost"] == "free"]
        if len(free) != len(out):
            did_repair = True
        out = free
    if len(out) > 3:
        out, did_repair = out[:3], True
    n_free = len([m for m in out if m["cost"] == "free"])
    if len(out) < 3 or n_free < 2:
        raise ValidationError(
            f"need exactly 3 distinct moves (not repeating earlier ones), at least 2 free and at most 1 paid; got {len(out)} usable ({n_free} free)"
        )
    return out, did_repair


async def chain_options(req: dict, **chain_opts) -> dict:
    """Moves from the model chain. Every option is generated; if the chain fails, LlmUnavailable reaches the student as a retry."""
    task = LlmTask(schema=moves_json_schema, temperature=MOVES_TEMPERATURE,
                   build=lambda hint: build_prompt(req, hint), parse=lambda text: assemble(req, parse_model_json(text)))
    r = await run_chain(task, **chain_opts)
    moves, repaired = r.value
    return {
        "moves": moves,
        "meta": {
            "requestedProvider": config.provider, "usedProvider": r.backend.provider, "model": r.backend.model,
            "promptVersion": PROMPT_VERSION, "latencyMs": r.latency_ms, "cacheHit": False, "repaired": r.repaired or repaired,
            "relaxed": False, "sources": ["generated"] * len(moves), "tried": [f"{t['id']}:{t['reason']}" for t in r.tried],
        },
    }
