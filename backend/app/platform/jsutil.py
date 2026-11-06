"""Small helpers that reproduce JavaScript behaviour the TypeScript backend relied on, so outputs stay identical."""
import json
import math
from datetime import datetime, timezone


def js_round(x: float) -> int:
    """Math.round: halves go up (Python's round() goes to even)."""
    return math.floor(x + 0.5)


def js_str(v) -> str:
    """String(v) for JSON-ish values."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def js_json(v) -> str:
    """JSON.stringify(v): compact, non-ASCII kept as is."""
    return json.dumps(v, separators=(",", ":"), ensure_ascii=False)


def js_iso(d: datetime) -> str:
    """Date.toISOString(): UTC with milliseconds and a Z."""
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


def utf16_len(s: str) -> int:
    """JS string length (UTF-16 code units)."""
    return len(s.encode("utf-16-le")) // 2


def utf16_slice(s: str, n: int) -> str:
    """s.slice(0, n) in UTF-16 code units (may split a surrogate pair, like JS)."""
    return s.encode("utf-16-le")[: n * 2].decode("utf-16-le", errors="ignore")


def js_number(v) -> float:
    """Number(v); NaN where JS gives NaN."""
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return 0.0
        try:
            return float(s)
        except ValueError:
            return math.nan
    return math.nan


def num(x: float):
    """A JS number as JSON would show it: integral floats become ints."""
    return int(x) if isinstance(x, float) and x.is_integer() else x


def is_num(v) -> bool:
    """typeof v === "number"."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)
