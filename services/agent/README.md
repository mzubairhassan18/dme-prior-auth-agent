# Agent service

Python 3.13 + FastAPI service for the DME prior-authorization agent.
Fully local LLM stack via Ollama:

- **phi4-mini** — clinical extraction / decision reasoning
- **nomic-embed-text** — 768-dim embeddings (RAG, step 6)

## Run

```bash
cd services/agent
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt   # Windows
# macOS/Linux: uv pip install --python .venv/bin/python -r requirements.txt

.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Configuration is environment-driven (see `.env.example`); defaults target a local
Ollama at `http://localhost:11434`.

## Endpoints

| Method | Path       | Description                                           |
| ------ | ---------- | ----------------------------------------------------- |
| GET    | `/health`  | service status + Ollama reachability + active models  |
| POST   | `/extract` | schema-constrained clinical extraction from notes     |
| POST   | `/embed`   | embeddings for up to 32 texts (used by RAG ingestion) |

Errors use RFC 7807 `application/problem+json`, matching the NestJS API.

## Test

```bash
cd services/agent
.venv/Scripts/python.exe -m pytest
```
