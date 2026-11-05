# dme-prior-auth-agent

Demo platform for a **Principal Full Stack Developer** application: an AI agent that
checks DME (durable medical equipment) orders against insurance policy documents and
drafts a prior-authorization recommendation — with a real-time operator dashboard.

## Architecture (evolving)

```
apps/web      Next.js 16 + Tailwind 4 + React 19   — intake form & agent monitor
apps/api      NestJS 12 (Node 24)                  — REST API / gRPC client
services/agent Python 3.13 + LangGraph             — RAG + LLM agent workflow
packages/shared TS contracts shared web ↔ api
docs/         plan/ and progress/ notes per build step
```

Runs fully local: **Ollama (phi4-mini + nomic-embed-text)** for LLM/embeddings,
Postgres, Redis, RabbitMQ, MinIO via Docker.

## Commands

```bash
docker compose up -d   # start Postgres (database-foundation step)
pnpm install           # install JS workspace
pnpm build             # turbo build (web + api)
pnpm lint              # turbo lint
pnpm dev               # turbo dev
```

## Docs

Step-by-step build decisions live in [`docs/`](docs/README.md).
