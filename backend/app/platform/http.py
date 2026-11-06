import json
from typing import Any, TypeVar

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

M = TypeVar("M", bound=BaseModel)
UUID_RE = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


async def read_json(req: Request, max_bytes: int = 16_384) -> Any:
    """Body as JSON whatever the content type (beacons arrive as text/plain); None if it isn't JSON or is over max_bytes
    (checked on Content-Length before reading, and on the bytes read)."""
    try:
        if int(req.headers.get("content-length") or 0) > max_bytes:
            return None
    except ValueError:
        return None
    size, chunks = 0, []
    async for chunk in req.stream():
        size += len(chunk)
        if size > max_bytes:
            return None
        chunks.append(chunk)
    try:
        return json.loads(b"".join(chunks))
    except ValueError:
        return None


def parse(model: type[M], data: Any) -> M | JSONResponse:
    """The model, or 400 {ok: false, error} (never FastAPI's 422; T-15)."""
    try:
        return model.model_validate(data)
    except ValidationError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


def ok(**kw) -> dict:
    return {"ok": True, **kw}


def err(message: str, status: int = 400, **kw) -> JSONResponse:
    return JSONResponse({"ok": False, "error": message, **kw}, status_code=status)
