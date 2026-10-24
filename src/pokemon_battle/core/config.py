from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")
    mistral_api_key: SecretStr = SecretStr("")
    mistral_chat_model: str = "mistral-small-latest"
    mistral_direct_chat_model: str = "mistral-large-4"
    mistral_embed_model: str = "mistral-embed"
    log_level: str = "INFO"

