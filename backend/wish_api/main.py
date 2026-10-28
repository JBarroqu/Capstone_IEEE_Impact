"""FastAPI backend for the Wish Engine. Run ONE worker: model health, cooldowns and the Gemini request queue live in memory."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .routes import admin, student

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Wish Engine API")

# The Next.js frontend runs on another origin (port), so the browser needs CORS with credentials for the admin cookie.
# Default: localhost and private LAN addresses on any port (moderated sessions over the LAN). Set CORS_ORIGINS in public.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_origin_regex=None if config.cors_origins else r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)
app.include_router(student.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health_check():
    return {"ok": True}
