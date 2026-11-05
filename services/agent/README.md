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

| Method | Path               | Description                                           |
| ------ | ------------------ | ----------------------------------------------------- |
| GET    | `/health`          | service status + Ollama reachability + active models  |
| POST   | `/extract`         | schema-constrained clinical extraction from notes     |
| POST   | `/embed`           | embeddings for up to 32 texts (used by RAG ingestion) |
| GET    | `/policies`        | indexed policy documents with chunk counts            |
| POST   | `/policies/search` | vector search over policy chunks with citations       |

Errors use RFC 7807 `application/problem+json`, matching the NestJS API.

## Policy RAG

Policy markdown lives in `policies/` with YAML front matter (title, payer, effective,
source). The corpus is embedded with `nomic-embed-text` into Postgres + pgvector.

```bash
# requires the pgvector-enabled Postgres (docker compose up -d) and Ollama
.venv/Scripts/python.exe -m scripts.ingest_policies
```

`DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:5432/dme`.
Re-running ingestion replaces each document's chunks, so it is idempotent.

## Test

```bash
cd services/agent
.venv/Scripts/python.exe -m pytest
```
