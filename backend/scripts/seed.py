"""Content lives in data/*.json (no DB rows needed). "Seeding" = validating the starter wishes; moves are all generated."""
import sys

import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.modules.wish.engine.wishes import wishes  # noqa: E402

bad, ids = 0, set()
for w in wishes:
    if not w.get("id") or not (w.get("text") or "").strip():
        bad += 1
        print("wish without id or text:", w, file=sys.stderr)
    if w.get("id") in ids:
        bad += 1
        print(f"duplicate wish id {w['id']}", file=sys.stderr)
    ids.add(w.get("id"))
print(f"{len(wishes)} wishes ({len([w for w in wishes if w.get('chip')])} chips), {bad} problems")
sys.exit(1 if bad else 0)
