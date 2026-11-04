"""FastAPI backend for the Wish Engine. Run ONE worker: model health, cooldowns and the Gemini request queue live in memory."""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .routes import admin, student

logging.basicConfig(level=logging.INFO)
# In public mode the OpenAPI pages are off: they list every route for anyone who looks.
docs = {} if not config.public_mode else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="Wish Engine API", **docs)

# Locally the Next.js frontend runs on another origin (port), so the browser needs CORS with credentials for the cookies.
# Default: localhost and private LAN addresses on any port (moderated sessions over the LAN). In public mode the proxy
# serves pages and API on one origin, so no cross-origin access is allowed unless CORS_ORIGINS names it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_origin_regex=None if config.cors_origins or config.public_mode else r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

SECURITY_HEADERS = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def security_headers(req: Request, call_next):
    """API responses are JSON or CSV, never pages: nothing may frame them, sniff them into HTML, or load from them.
    The /docs page needs its own scripts, so it keeps the browser defaults (it is off in public mode anyway)."""
    res = await call_next(req)
    if not req.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        for k, v in SECURITY_HEADERS.items():
            res.headers.setdefault(k, v)
    if config.public_mode:
        res.headers.setdefault("strict-transport-security", "max-age=31536000")
    return res


app.include_router(student.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health_check():
    return {"ok": True}
