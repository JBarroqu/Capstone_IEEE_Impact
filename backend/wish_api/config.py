"""Env-driven settings; mirrors what lib/config.ts did. Reads ../.env so the app and the API share one file."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def env(k: str, d: str = "") -> str:
    return os.environ.get(k, d)


def flag(k: str, d: bool = False) -> bool:
    v = env(k).strip().lower()
    return d if not v else v in ("1", "true", "yes")


def _provider() -> str:
    """auto: every available model (Gemini, then Groq/OpenRouter if keyed, then local Ollama). gemini/ollama: only that service."""
    p = env("MOVE_PROVIDER")
    return p if p in ("auto", "ollama", "gemini") else "auto"


class Config:
    provider = _provider()
    gemini_key = env("GEMINI_API_KEY")
    # Optional comma list to pin Gemini models in order; empty = discover from the API.
    gemini_models = env("GEMINI_MODELS")
    gemini_max_models = int(env("GEMINI_MAX_MODELS", "10"))
    gemini_rpm = int(env("GEMINI_RPM", "9"))
    ollama_url = env("OLLAMA_URL", "http://localhost:11434")
    ollama_model = env("OLLAMA_MODEL", "llama3.1:8b")
    # Per model call. Short-ish because a slow model is skipped for the next one in the chain.
    llm_timeout_ms = int(env("LLM_TIMEOUT_MS", "12000"))
    # Whole request across every model tried before the student sees a retry prompt.
    llm_budget_ms = int(env("LLM_BUDGET_MS", "60000"))
    # Classification runs while the student fills in the next screen; keyword matching answers if this runs out.
    classify_budget_ms = int(env("CLASSIFY_BUDGET_MS", "20000"))
    # The student waits on a loading state for the follow-up questions; the fixed quiz is shown if this runs out.
    questions_budget_ms = int(env("QUESTIONS_BUDGET_MS", "20000"))
    shuffle_positions = env("SHUFFLE_POSITIONS") == "true"
    # 1 = quick survey: pick one move, then rate it. 3 = full path (moves 1-3, optionally up to 5).
    flow_moves = 3 if env("FLOW_MOVES", "1") == "3" else 1
    admin_password = env("ADMIN_PASSWORD")
    app_version = "0.1.0"
    database_url = env("DATABASE_URL")
    data_dir = Path(env("DATA_DIR", str(ROOT / "data")))
    # Browser origins allowed to call the API with cookies. Empty = localhost and private LAN addresses on any port.
    cors_origins = [o.strip() for o in env("CORS_ORIGINS").split(",") if o.strip()]
    # Public deployment (docker-compose.public.yml): API docs off, HSTS on. Behind a proxy that owns X-Forwarded-*.
    public_mode = flag("PUBLIC_MODE")
    # Trust X-Forwarded-For/-Proto/-Host. Only behind a proxy that overwrites them (Caddy does); otherwise clients pick their own IP.
    trust_proxy = flag("TRUST_PROXY", public_mode)
    # Key for the session and admin cookies; empty = a random key kept in the settings table.
    session_secret = env("SESSION_SECRET")
    rate_limit = flag("RATE_LIMIT", True)
    # Admin login over plain http from another machine sends the password in cleartext; refused unless this is set.
    admin_allow_http = flag("ADMIN_ALLOW_HTTP")


config = Config()

# Consent copy; edit freely. Chosen by the provider in use.
CONSENT_INTRO = (
    "This is a prototype. It suggests first moves for something you want to make happen. Your choices and feedback are "
    "saved under the name you enter below, so the researcher can tell participants apart. Please don't type other personal "
    "details (like contact info) into any text field."
)


def consent_remote(services: list[str]) -> str:
    return (
        f"What you type in the wish, why, and prior-attempts fields is sent to an outside model service ({', '.join(services)}) "
        "to generate options, and may be reviewed by that service. Your name is not sent."
    )


CONSENT_LOCAL = "Nothing you type leaves this test machine."
