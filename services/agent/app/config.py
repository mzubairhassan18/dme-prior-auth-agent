from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration via environment variables (see .env.example)."""

    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "phi4-mini"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout_seconds: float = 180.0
    database_url: str = "postgresql://postgres:postgres@localhost:5432/dme"
    agent_port: int = 8000
    rabbitmq_url: str = "amqp://dme:dme@localhost:5672"
    rabbitmq_exchange: str = "dme.events"
    rabbitmq_order_queue: str = "agent.order-created"
    rabbitmq_dead_letter_exchange: str = "dme.dlx"
    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50051

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
