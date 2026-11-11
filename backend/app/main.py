"""Impact++ API (docs/ARCHITECTURE.md). One FastAPI app: platform routes, one router per module, the admin, and the
built React app served as static files on the same origin (T-03). Run ONE worker (T-11)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db, policies
from .config import config
from .modules.feed import api as feed_api
from .modules.feed.router import router as feed_router
from .modules.growth import service as growth_service
from .modules.growth.router import router as growth_router
from .modules.profile.router import router as profile_router
from .modules.social.router import router as social_router
from .modules.wish import api as wish_api
from .modules.wish.router import router as wish_router
from .platform import jobs
from .platform.admin.router import router as admin_router
from .platform.core_router import router as core_router
from .platform.events_log.router import router as events_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    policies.loader.validate_env()
    wish_api.register()
    feed_api.register()
    if config.database_url:
        await policies.refresh(force=True)
        jobs.on_startup("recover-scoring", growth_service.recover_stuck)
        jobs.on_startup("buddy-timeout", growth_service.timeout_sweep)
        jobs.every("buddy-timeout", 3600, growth_service.timeout_sweep)
        jobs.every("policies", 30, policies.refresh)
        await jobs.start()
    yield
    await jobs.stop()
    await db.dispose()


docs = {} if not config.public_mode else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="Impact++ API", lifespan=lifespan, **docs)

if config.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["content-type", "authorization"])

API_HEADERS = {"x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "same-origin",
               "permissions-policy": "camera=(), microphone=(), geolocation=()"}


def _csp() -> str:
    supa = config.supabase_url or ""
    return ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            f"font-src 'self' data:; connect-src 'self' {supa}; frame-ancestors 'none'; base-uri 'self'; "
            "form-action 'self'; object-src 'none'")


@app.middleware("http")
async def security_headers(req: Request, call_next):
    res = await call_next(req)
    if not req.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        for k, v in API_HEADERS.items():
            res.headers.setdefault(k, v)
        res.headers.setdefault("content-security-policy", _csp() if not req.url.path.startswith("/api/")
                               else "default-src 'none'; frame-ancestors 'none'")
    if config.public_mode:
        res.headers.setdefault("strict-transport-security", "max-age=31536000")
    return res


@app.exception_handler(HTTPException)
async def http_error(req: Request, exc: HTTPException):
    return JSONResponse({"ok": False, "error": exc.detail if isinstance(exc.detail, str) else "error"}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled(req: Request, exc: Exception):
    logging.getLogger("impact").exception("unhandled error on %s", req.url.path)
    return JSONResponse({"ok": False, "error": "Something went wrong."}, status_code=500)


for r in (core_router, events_router, profile_router, wish_router, growth_router, social_router, feed_router, admin_router):
    app.include_router(r)

# Same-origin React build (T-03): assets as files, every other non-API path gets index.html (client-side routing).
if config.serve_spa and (config.spa_dir / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=config.spa_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"ok": False, "error": "not found"}, status_code=404)
        f = (config.spa_dir / path).resolve()
        if path and f.is_file() and config.spa_dir.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(config.spa_dir / "index.html", headers={"cache-control": "no-store"})
