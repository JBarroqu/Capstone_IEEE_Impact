"""Environment settings (infrastructure only). Product behaviour that a module owner might want different lives in
app/policies (docs/MODULE_OWNER_DECISIONS.md), not here. Reads ../.env so the API and the frontend share one file."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
# .env.local (git-ignored, local Supabase values) wins over .env; real env vars win over both.
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")


def env(k: str, d: str = "") -> str:
    return os.environ.get(k, d)


def flag(k: str, d: bool = False) -> bool:
    v = env(k).strip().lower()
    return d if not v else v in ("1", "true", "yes")


def _provider() -> str:
    """auto: every available model (Gemini, then Groq/OpenRouter if keyed, then local Ollama). Otherwise only that service."""
    p = env("LLM_PROVIDER") or env("MOVE_PROVIDER")
    return p if p in ("auto", "ollama", "gemini", "fake") else "auto"


class Config:
    env_name = env("ENV", "development")
    app_version = "1.0.0-integration"
    # The deployed commit (Render sets RENDER_GIT_COMMIT); the deploy pipeline waits for /health to report it.
    git_commit = env("RENDER_GIT_COMMIT") or env("GIT_COMMIT")

    # Supabase
    database_url = env("DATABASE_URL")
    supabase_url = env("SUPABASE_URL").rstrip("/")
    supabase_secret_key = env("SUPABASE_SECRET_KEY")
    # Only for projects still on the legacy HS256 JWT secret (T-04). JWKS is used whenever the token's kid matches.
    supabase_jwt_secret = env("SUPABASE_JWT_SECRET")

    # Model chain (T-10)
    provider = _provider()
    # The test-only fake model (app/llm/fake.py) loads only when ENV=test and LLM_FAKE=1 (D-29).
    llm_fake = flag("LLM_FAKE") and env("ENV") == "test"
    gemini_key = env("GEMINI_API_KEY")
    gemini_models = env("GEMINI_MODELS")
    gemini_max_models = int(env("GEMINI_MAX_MODELS", "10"))
    gemini_rpm = int(env("GEMINI_RPM", "9"))
    ollama_url = env("OLLAMA_URL", "http://localhost:11434")
    ollama_model = env("OLLAMA_MODEL", "llama3.1:8b")
    llm_timeout_ms = int(env("LLM_TIMEOUT_MS", "12000"))
    llm_budget_ms = int(env("LLM_BUDGET_MS", "60000"))
    classify_budget_ms = int(env("CLASSIFY_BUDGET_MS", "20000"))
    questions_budget_ms = int(env("QUESTIONS_BUDGET_MS", "20000"))

    # Data files
    data_dir = Path(env("DATA_DIR", str(ROOT / "data")))
    catalog_path = Path(env("CATALOG_PATH", str(ROOT / "data" / "catalog.json")))

    # Web
    serve_spa = flag("SERVE_SPA", True)
    spa_dir = Path(env("SPA_DIR", str(ROOT / "frontend" / "dist")))
    cors_origins = [o.strip() for o in env("CORS_ORIGINS").split(",") if o.strip()]
    public_mode = flag("PUBLIC_MODE")
    trust_proxy = flag("TRUST_PROXY", public_mode)
    proxy_hops = max(1, int(env("PROXY_HOPS", "1")))
    rate_limit = flag("RATE_LIMIT", True)

    # Admin (D-47) and signing key for the admin cookie and event tickets
    admin_password = env("ADMIN_PASSWORD")
    admin_allow_http = flag("ADMIN_ALLOW_HTTP")
    session_secret = env("SESSION_SECRET")


config = Config()
