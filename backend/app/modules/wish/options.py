import asyncio

from sqlalchemy.dialects.postgresql import insert

from .. import db
from .llm import chain_options


async def persist_generated(req: dict, moves: list[dict], meta: dict) -> None:
    if not req.get("sessionId"):
        return
    async with db.engine().begin() as c:
        await c.execute(insert(db.generated_moves).values([
            {"id": m["id"], "session_id": req["sessionId"], "wish_id": req.get("wishId"), "step": req["step"], "move": m,
             "provider": meta["usedProvider"], "model": meta.get("model"), "prompt_version": meta.get("promptVersion")}
            for m in moves
        ]).on_conflict_do_nothing())


async def get_options(req: dict, persist=persist_generated, **chain_opts) -> dict:
    """Entry point used by the API. Every request goes to the model (no cache), so two students with the same wish get
    their own options. Raises LlmUnavailable when the chain fails; the student then sees a retry."""
    result = await chain_options(req, **chain_opts)
    # Fire and forget, as before: the student does not wait on the insert.
    task = asyncio.ensure_future(persist(req, result["moves"], result["meta"]))
    _pending.add(task)
    task.add_done_callback(lambda t: (_pending.discard(t), t.exception()))
    return result


_pending: set[asyncio.Future] = set()
