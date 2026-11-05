import json
from typing import Any, Protocol

import httpx

from .config import Settings


class ProviderError(RuntimeError):
    """Raised when the model provider is unreachable or returns invalid output."""


class ChatProvider(Protocol):
    """Minimal surface the agent needs — swap Ollama for OpenAI/Anthropic freely."""

    async def complete_json(
        self, *, system: str, user: str, schema: dict[str, Any]
    ) -> dict[str, Any]: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    async def ping(self) -> bool: ...


class OllamaProvider:
    """Local Ollama client using the native API (JSON-schema constrained output)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds),
        )

    async def complete_json(
        self, *, system: str, user: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        payload = {
            "model": self._settings.ollama_chat_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "format": schema,
            "options": {"temperature": 0.1, "num_ctx": 8192},
        }

        try:
            response = await self._client.post("/api/chat", json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama chat request failed: {exc}") from exc

        content = response.json().get("message", {}).get("content", "")
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise ProviderError("Ollama returned non-JSON content") from exc

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            response = await self._client.post(
                "/api/embed",
                json={"model": self._settings.ollama_embed_model, "input": texts},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama embed request failed: {exc}") from exc

        embeddings: list[list[float]] = response.json().get("embeddings", [])
        if len(embeddings) != len(texts):
            raise ProviderError(
                f"Expected {len(texts)} embeddings, received {len(embeddings)}"
            )
        return embeddings

    async def ping(self) -> bool:
        try:
            response = await self._client.get("/api/tags", timeout=5.0)
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def aclose(self) -> None:
        await self._client.aclose()
