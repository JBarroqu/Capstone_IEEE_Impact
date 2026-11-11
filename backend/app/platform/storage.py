"""Supabase Storage over its REST API with the secret key (T-09). Buckets `resumes` and `evidence` are private; files
are read only through short signed URLs issued after an access check."""
import httpx

from ..config import config

SIGNED_URL_TTL_S = 60


class StorageError(Exception):
    pass


def _headers(extra: dict | None = None) -> dict:
    k = config.supabase_secret_key
    h = {"apikey": k, "Authorization": f"Bearer {k}"}
    return {**h, **(extra or {})}


def _base() -> str:
    return f"{config.supabase_url}/storage/v1"


async def upload(bucket: str, path: str, data: bytes, content_type: str) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{_base()}/object/{bucket}/{path}", content=data,
                         headers=_headers({"content-type": content_type, "x-upsert": "true"}))
    if r.status_code >= 300:
        raise StorageError(f"upload failed {r.status_code}: {r.text[:200]}")
    return path


async def delete(bucket: str, path: str) -> None:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.request("DELETE", f"{_base()}/object/{bucket}", json={"prefixes": [path]}, headers=_headers())
    if r.status_code >= 300:
        raise StorageError(f"delete failed {r.status_code}: {r.text[:200]}")


async def signed_url(bucket: str, path: str, ttl_s: int = SIGNED_URL_TTL_S) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{_base()}/object/sign/{bucket}/{path}", json={"expiresIn": ttl_s}, headers=_headers())
    if r.status_code >= 300:
        raise StorageError(f"sign failed {r.status_code}: {r.text[:200]}")
    rel = r.json().get("signedURL") or r.json().get("signedUrl")
    return f"{_base()}{rel}" if rel and rel.startswith("/") else rel
