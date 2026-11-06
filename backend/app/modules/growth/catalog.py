"""Career taxonomy and opportunities from data/catalog.json (D-08, D-09, D-27). Loaded once; catalogVersion is a hash
of the file so a GrowthState says which catalog produced it."""
import hashlib
import json
from functools import lru_cache

from ...config import config


@lru_cache(maxsize=1)
def load() -> dict:
    raw = config.catalog_path.read_bytes()
    data = json.loads(raw)
    for c in data["careers"]:
        assert c["id"] and c["skills"], "every career needs an id and skills"
    data["version"] = "c-" + hashlib.sha1(raw).hexdigest()[:6]
    data["by_id"] = {c["id"]: c for c in data["careers"]}
    return data


def career(career_id: str | None) -> dict | None:
    return load()["by_id"].get(career_id or "")


def career_ids() -> list[str]:
    return [c["id"] for c in load()["careers"]]


def opportunities() -> list[dict]:
    return load()["opportunities"]


def version() -> str:
    return load()["version"]


def public() -> dict:
    d = load()
    return {"version": d["version"], "careers": d["careers"], "opportunities": d["opportunities"]}
