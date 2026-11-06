# Plan — Deployment & Demo Readiness

**Step:** 13 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Make the demo reproducible and reviewable outside this machine:

- One-command, production-like local stack: web, API, agent REST/gRPC/worker, Postgres,
  RabbitMQ, Redis, MinIO, with host Ollama for inference.
- Container images built from the monorepo (no host Node/Python install needed at runtime).
- A short demo script with seeded data, policy ingestion, and document upload.
- An honest cloud deployment map (AWS) for the same topology, even though AWS is not
  available for this build.
- Final README/docs polish and screenshots.

## Decisions (recommended options chosen autonomously)

### 1. Container layout

| Image       | Build                                                    | Runtime                                                            |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `dme-api`   | Node 24 + pnpm, Prisma generate, Nest build              | `prisma migrate deploy` then `node dist/main`                      |
| `dme-web`   | Node 24 + pnpm, Next build with public API URLs baked in | `next start` on `0.0.0.0:3000`                                     |
| `dme-agent` | Python 3.13 slim, runtime requirements only              | one image, three commands: uvicorn, gRPC server, RabbitMQ consumer |

All Dockerfiles use the **repo root as build context** because the apps consume
`packages/shared` and `pnpm-lock.yaml`. A root `.dockerignore` keeps `node_modules`,
`.next`, virtualenvs, git history, and `.env` files out of the context.

### 2. Compose topology

`docker-compose.prod.yml` starts:

```
web :3000 ──> api :3001 ──> postgres (pgvector)
                 │  ├──> redis
                 │  ├──> rabbitmq
                 │  ├──> minio
                 │  └──> agent-grpc :50051
                 └──> agent (REST) / agent-consumer
                              └──> ollama (host by default)
```

- **Host Ollama is the default** (`host.docker.internal:11434`) so the demo reuses the
  models already pulled locally. An optional `ollama` service is behind the `llm`
  profile for self-contained runs.
- **Migrations run at API start** for the single-instance demo; docs call out a separate
  migration job for real multi-replica deployments.
- **Infra ports bind to `127.0.0.1`** by default. Postgres is exposed only for seeding and
  policy ingestion from the host.
- Healthchecks gate startup: Postgres, RabbitMQ, Redis, MinIO, API, web, agent REST/gRPC.
- Names are distinct from the dev compose project (`dme-prior-auth` vs default), and no
  `container_name` is pinned, so both stacks can exist without name clashes.

### 3. Configuration

- `.env.prod.example` documents every value; the real `.env.prod` stays gitignored.
- No secrets are baked into images. Demo defaults exist only for local use; docs list the
  production replacements (Secrets Manager, TLS, auth, private ports).
- Public Next variables are **build args** because Next inlines `NEXT_PUBLIC_*` at build
  time. Changing the public API URL requires a web image rebuild.

### 4. Python dependency split

`requirements.txt` becomes runtime-only (plus the previously implicit `PyYAML` used by
policy ingestion). `requirements-dev.txt` adds pytest, pytest-asyncio, and grpcio-tools.
CI and local setup install the dev file; the agent image installs the lean runtime file.

### 5. Cloud map, not a fake deploy

AWS is unavailable, so no live cloud resources are created. `docs/deployment.md` maps each
compose service to an AWS equivalent and documents the gaps that must be closed before a
real deployment (auth, secrets, HA, observability, Bedrock provider adapter, CI/CD).

### 6. Demo polish

- README quick start for the Docker stack and a concise demo script.
- `docs/deployment.md`: local runbook, environment table, AWS mapping, security/ops notes.
- Verify the stack, seed data, ingest policies, run a real analysis, upload/download a
  document, and capture the final dashboard state.

## Files

```
.dockerignore
apps/api/Dockerfile
apps/web/Dockerfile
services/agent/Dockerfile
services/agent/requirements.txt          runtime-only
services/agent/requirements-dev.txt      new
docker-compose.prod.yml
.env.prod.example
docs/deployment.md
docs/plan/deployment-and-demo-readiness.md
docs/progress/deployment-and-demo-readiness.md
README.md
docs/README.md
.github/workflows/ci.yml                 install dev requirements
```

## Verification

- `docker compose -f docker-compose.prod.yml config` is valid.
- All three images build.
- Stack starts healthy; API migration and MinIO bucket bootstrap succeed.
- Seed + policy ingestion work inside containers.
- A new order flows through RabbitMQ → agent → decision; web reflects it.
- Document upload/download works through MinIO presigned URLs.
- `GET /health` for API/web/agent and gRPC smoke test pass.
- Local JS/Python suites stay green after the dependency split.

## Definition of done

- [ ] Images build and stack runs from a clean volume
- [ ] Migrations, seed, policy ingestion, event-driven analysis, and document upload verified
- [ ] README + deployment docs complete, screenshots current
- [ ] Step 13 plan/progress and docs index updated
- [ ] Commit pushed; public repo URL recorded
- [ ] GitHub Actions caveat documented (account billing lock)
