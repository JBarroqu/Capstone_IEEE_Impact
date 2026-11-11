import json
import re

from ....config import config
from ..vocab import DOMAINS, FOCUSES

_keywords = json.loads((config.data_dir / "keywords.json").read_text())


def _score_map(text: str, m: dict[str, list[str]]) -> dict[str, int]:
    t = f" {re.sub(r'[^a-z0-9+\- ]', ' ', text.lower())} "
    return {k: sum(1 for w in words if f" {w} " in t or (len(w) > 4 and w in t)) for k, words in m.items()}


def _top(scores: dict[str, int], order: tuple, n: int) -> list[str]:
    hits = [(k, scores.get(k, 0)) for k in order if scores.get(k, 0) > 0]
    hits.sort(key=lambda x: (-x[1], order.index(x[0])))
    return [k for k, _ in hits[:n]]


def classify_wish(text: str) -> dict:
    """Keyword classifier. Unknown text -> empty guesses (no preselection)."""
    d = _score_map(text, _keywords["domains"])
    f = _score_map(text, _keywords["focus"])
    hits = sum(d.values()) + sum(f.values())
    return {"domains": _top(d, DOMAINS, 2), "focus": _top(f, FOCUSES, 2), "confidence": min(1, hits / 4)}
