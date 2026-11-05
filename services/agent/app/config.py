from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration via environment variables (see .env.example)."""

    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "phi4-mini"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout_seconds: float = 180.0
    agent_port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
