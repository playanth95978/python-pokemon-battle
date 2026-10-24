from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    mistral_api_key: SecretStr = SecretStr("")
    mistral_chat_model: str = "mistral-small-latest"
    mistral_direct_chat_model: str = "mistral-large-4"
    mistral_embed_model: str = "mistral-embed"
    vespa_url: str = "http://127.0.0.1:8085"
    log_level: str = "INFO"
    secret_key: SecretStr = SecretStr("")
    access_token_expire_minutes: int = Field(default=15, gt=0)
    jwt_issuer: str = Field(default="mistral-rag-backend", min_length=1)
    jwt_audience: str = Field(default="mistral-rag-api", min_length=1)
    auth_cookie_secure: bool = False
    auth_allowed_origins: list[str] = [
        "http://127.0.0.1:8001",
        "http://localhost:8001",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]
    database_url: SecretStr = SecretStr("postgresql+asyncpg://rag:rag_local_dev@127.0.0.1:5434/rag")
    adzuna_app_id: str = ""
    adzuna_app_key: SecretStr = SecretStr("")
    adzuna_country: str = "fr"
    adzuna_results_per_page: int = 50
