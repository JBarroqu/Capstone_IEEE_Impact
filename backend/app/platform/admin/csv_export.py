import json
import re

from ..jsutil import js_str


def _esc(v) -> str:
    if v is None:
        return ""
    s = json.dumps(v, separators=(",", ":"), ensure_ascii=False) if isinstance(v, (dict, list)) else js_str(v)
    # Spreadsheet apps run cells starting with = + - @ (or tab/CR) as formulas; a leading ' keeps them as text.
    if isinstance(v, str) and re.match(r"[=+\-@\t\r]", s):
        s = f"'{s}"
    return f'"{s.replace(chr(34), chr(34) * 2)}"' if re.search(r'[",\r\n]', s) else s


def to_csv(rows: list[dict], columns: list[str] | None = None) -> str:
    """CSV with a UTF-8 BOM so Excel opens it cleanly."""
    cols = columns or list(dict.fromkeys(k for r in rows for k in r))
    lines = [",".join(_esc(c) for c in cols)]
    lines += [",".join(_esc(r.get(c)) for c in cols) for r in rows]
    return "﻿" + "\r\n".join(lines) + "\r\n"
