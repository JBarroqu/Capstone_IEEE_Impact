from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    jwt_secret: str = "development-only-change-me"
    database_url: str = "sqlite:///./impact.db"
    frontend_origins: str = "http://127.0.0.1:5500,http://localhost:5500"
    upload_dir: str = "./uploads"
    access_token_minutes: int = 10080
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()