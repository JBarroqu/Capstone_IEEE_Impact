import json
from typing import Any, TypeVar

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

M = TypeVar("M", bound=BaseModel)
UUID_RE = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


async def read_json(req: Request) -> Any:
    """Body as JSON whatever the content type (beacons arrive as text/plain); None if it isn't JSON."""
    try:
        return json.loads(await req.body())
    except ValueError:
        return None


def parse(model: type[M], data: Any) -> M | JSONResponse:
    """The model, or the same 400 {ok: false, error} the Next.js routes returned."""
    try:
        return model.model_validate(data)
    except ValidationError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


def ok(**kw) -> dict:
    return {"ok": True, **kw}
