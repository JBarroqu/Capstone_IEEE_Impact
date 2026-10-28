"""Content lives in data/*.json (no DB rows needed). "Seeding" = validating the starter wishes; moves are all generated."""
import sys

from wish_api.engine.wishes import wishes

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
