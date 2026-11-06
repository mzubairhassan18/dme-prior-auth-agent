# Deployment & Demo Runbook

This repo ships a **production-like local stack** in `docker-compose.prod.yml`. It is the
fastest way to review the whole system without installing Node, Python, or the databases
on the host. AWS is not available for this build, so the cloud section is an architecture
map, not a live deployment.

## Topology

```
                         host Ollama (:11434)
                                  │
   browser :3000 ──> web ──> api :3001 ──> postgres (pgvector)
                              │  ├──> redis
                              │  ├──> rabbitmq <──> agent-consumer
                              │  ├──> minio
                              │  └──> agent-grpc :50051
                              └──> agent (REST :8000)
```

- `web` — Next.js production server, public env baked at build time.
- `api` — NestJS; runs Prisma migrations on boot, then serves REST + Socket.IO.
- `agent` — FastAPI REST service; `agent-grpc` exposes the same workflow over gRPC;
  `agent-consumer` analyzes `order.created` events from RabbitMQ.
- `postgres`, `rabbitmq`, `redis`, `minio` — durable data and messaging services.
- Ollama stays on the host by default so the multi-GB models are not duplicated inside
  Docker. An optional `llm` profile can run it in Compose instead.

## Prerequisites

- Docker Desktop (Compose v2), at least 8 GB of memory available.
- Ollama installed and running on the host.
- The models pulled once:

```bash
ollama pull phi4-mini
ollama pull nomic-embed-text
```

- Ports `3000`, `3001`, `5432`, `5672`, `6379`, `8000`, `9000`, `9001`, `15672`, `50051`
  free. The dev compose file uses some of the same ports; stop it first:

```bash
docker compose down
```

Also stop any host processes using 3000/3001/8000/50051 (the local dev servers).

## First run

```bash
cp .env.prod.example .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

Wait for the healthchecks to turn green. The first build compiles the web and API and
installs the Python runtime; subsequent runs use the layer cache.

Seed demo data and the policy index **once** (both are idempotent):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec api pnpm exec tsx prisma/seed.ts
docker compose --env-file .env.prod -f docker-compose.prod.yml exec agent python -m scripts.ingest_policies
```

Policy ingestion embeds three synthetic payer policies with `nomic-embed-text`; expect it
to take a minute or two on CPU.

| Service             | URL                          | Credentials                |
| ------------------- | ---------------------------- | -------------------------- |
| Web dashboard       | http://localhost:3000        | —                          |
| API                 | http://localhost:3001/api/v1 | —                          |
| Agent REST          | http://localhost:8000/health | —                          |
| RabbitMQ management | http://localhost:15672       | `dme` / `dme`              |
| MinIO console       | http://localhost:9001        | `dme` / `dme-local-secret` |

All published ports bind to `127.0.0.1` by default. Set `DME_BIND_ADDR=0.0.0.0` in
`.env.prod` only if you need LAN access and understand the missing auth layer.

## Demo script (5–8 minutes)

1. Open http://localhost:3000. Point out the queue stats and the **Live** Socket.IO badge.
2. Click **New intake** and submit an order. Suggested values:
   - patient: `Demo Patient`, DOB `1960-01-01`, payer `Medicare Part B`, member `MBR-DEMO-1`
   - equipment: `E0601`, diagnosis: `G47.33`, quantity `1`
   - notes: `In-lab sleep study AHI 32/hr. Prior 30-day PAP trial discontinued due to mask intolerance.`
3. Stay on the dashboard: the row moves `SUBMITTED → ANALYZING → DECISION_READY` without a
   refresh. The API relays `order.*` events over Socket.IO; polling is the fallback.
4. Open the order. Show the decision outcome, rationale, confidence, cited policy section,
   missing documents, and the model name.
5. Upload a small PDF/PNG/JPEG (≤5 MB) in **Clinical documents**, then click **Download**.
   The browser receives a 15-minute MinIO presigned URL; credentials never reach the page.
6. Optional: open RabbitMQ management to show the `dme.events` topic exchange,
   `agent.order-created` queue, and the dead-letter queue.
7. Optional: gRPC smoke test against the same workflow:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec agent-grpc \
  python -m scripts.grpc_smoke <order-id>
```

8. Optional: open http://localhost:9001 and show the `dme-clinical-documents` bucket.

If no order was analyzed, check that the consumer is running and that Ollama is reachable:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f agent-consumer
curl http://localhost:8000/health
```

## Configuration

Environment values come from `.env.prod` (gitignored); the example file documents the
demo defaults. Never commit the real file.

| Variable                                  | Used by              | Default                             | Notes                                                                 |
| ----------------------------------------- | -------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `DME_BIND_ADDR`                           | port mappings        | `127.0.0.1`                         | use `0.0.0.0` for LAN demos                                           |
| `POSTGRES_PASSWORD`                       | postgres, api, agent | `postgres`                          | URL-encode special characters                                         |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD`     | rabbitmq, api, agent | `dme` / `dme`                       | replace in a real deploy                                              |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | minio, api           | `dme` / `dme-local-secret`          | replace in a real deploy                                              |
| `MINIO_BUCKET`                            | api                  | `dme-clinical-documents`            | created on API boot                                                   |
| `MINIO_PUBLIC_ENDPOINT`                   | api                  | `localhost`                         | hostname signed into presigned URLs (internal operations use `minio`) |
| `OLLAMA_BASE_URL`                         | agent                | `http://host.docker.internal:11434` | use `http://ollama:11434` with the `llm` profile                      |
| `OLLAMA_CHAT_MODEL`                       | agent                | `phi4-mini`                         | schema-constrained extraction                                         |
| `OLLAMA_EMBED_MODEL`                      | agent                | `nomic-embed-text`                  | 768-dim policy embeddings                                             |
| `NEXT_PUBLIC_API_URL`                     | web build            | `http://localhost:3001/api/v1`      | **baked at build time**                                               |
| `NEXT_PUBLIC_SOCKET_URL`                  | web build            | `http://localhost:3001`             | **baked at build time**                                               |

### Host Ollama troubleshooting

If `/health` reports `ollama: down` from inside the agent container:

1. Confirm the host can answer: `curl http://localhost:11434/api/tags`.
2. On Linux, Ollama must listen beyond loopback: start it with `OLLAMA_HOST=0.0.0.0 ollama serve`.
3. Or use the self-contained profile:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile llm up -d ollama
docker compose --env-file .env.prod -f docker-compose.prod.yml exec ollama ollama pull phi4-mini
docker compose --env-file .env.prod -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
# set OLLAMA_BASE_URL=http://ollama:11434 in .env.prod, then:
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d agent agent-grpc agent-consumer
```

### Orders stuck in `ANALYZING`

The queue allows competing consumers, so a host-side development worker can steal
events from the containerized worker if both point at the same RabbitMQ. Check:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec rabbitmq \
  rabbitmqctl list_consumers queue_name consumer_tag
```

Stop any local `python -m app.consumer` process before running the production-like
stack, then retry the order. Only one worker should consume `agent.order-created`.

### Changing the public URL

If you set `DME_BIND_ADDR=0.0.0.0` for a LAN demo, also set `MINIO_PUBLIC_ENDPOINT` to the
hostname or IP the browser uses; otherwise presigned URLs still point at `localhost`.

`NEXT_PUBLIC_*` values are inlined by Next during `next build`. To expose the demo on a
different hostname, set both values in `.env.prod`, then rebuild the web image:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml build web
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d web
```

## Operations

```bash
# logs for one service
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api

# restart after an image rebuild
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# stop everything, keep data
docker compose --env-file .env.prod -f docker-compose.prod.yml down

# full reset (deletes Postgres, RabbitMQ, Redis, MinIO, Ollama volumes)
docker compose --env-file .env.prod -f docker-compose.prod.yml down -v
```

Health endpoints:

- API: `GET /api/v1/health` → `{ status, db }`
- Agent: `GET /health` → `{ status, ollama, chat_model, embed_model }`
- Web: `GET /` (the container healthcheck)

The API container runs `prisma migrate deploy` before `node dist/main`. That is safe for
this single-instance demo; a multi-replica deployment should run migrations as a separate
one-shot ECS task/job before rolling the service.

## AWS mapping (not deployed)

The compose topology maps cleanly to managed AWS services. This is the target design for a
real deployment; no AWS resources were created for this build.

| Local service              | AWS target                                       | Notes                                                                                                  |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `web`                      | ECR → ECS Fargate + ALB (or CloudFront in front) | set `NEXT_PUBLIC_API_URL`/`SOCKET_URL` to the public API hostname and rebuild                          |
| `api`                      | ECR → ECS Fargate behind ALB                     | healthcheck `/api/v1/health`; WebSocket needs ALB sticky sessions or a Socket.IO adapter (ElastiCache) |
| `agent` REST/gRPC/consumer | three ECS services from one image                | service discovery/Cloud Map for gRPC; SQS/Amazon MQ for events                                         |
| `postgres`                 | RDS for PostgreSQL 16 with pgvector              | multi-AZ, automated backups, encryption; run migrations as a task                                      |
| `rabbitmq`                 | Amazon MQ for RabbitMQ                           | or SQS/SNS if the event contract is redesigned                                                         |
| `redis`                    | ElastiCache for Redis                            | cache-aside keys already tolerate outages                                                              |
| `minio`                    | S3                                               | presigned URLs map directly; use SSE-KMS and private bucket policy                                     |
| host Ollama                | Bedrock (or ECS GPU/CPU task)                    | add a `ChatProvider` adapter for Bedrock Converse + embeddings; keep the workflow/RAG code unchanged   |
| `.env.prod`                | Secrets Manager / SSM Parameter Store            | inject at task definition; never bake into images                                                      |
| logs                       | CloudWatch Logs + OpenTelemetry/X-Ray            | NestJS and FastAPI both have OTel hooks                                                                |

Suggested rollout order: RDS + pgvector migration → S3 bucket + IAM → Amazon MQ → ECS
agent services → ECS API → ECS web → ALB/Route 53/TLS → observability and alarms. Build
and push images from CI (`.github/workflows/ci.yml`) once the GitHub account billing lock
is cleared; add ECR login + `docker push` + `aws ecs update-service` steps.

### What still needs hardening before real patient data

This is a **demo with synthetic data**, not a HIPAA-ready product:

- **No authentication or authorization.** Add Cognito/OIDC, role-based access, and
  tenant/patient isolation before exposing any endpoint.
- **No BAA-covered services or encryption review.** Use only HIPAA-eligible AWS services,
  enable KMS encryption, TLS everywhere, private subnets, and audit logging.
- **Secrets are demo defaults.** Move them to Secrets Manager; rotate DB/MinIO/MQ creds.
- **No HA or backup drill.** RDS multi-AZ, S3 versioning, MQ HA, and restore tests.
- **No rate limiting/WAF.** Add ALB/WAF rules and application-level quotas.
- **No clinical validation loop.** The agent is decision support, not an autonomous payer;
  a clinician/prior-auth specialist must review every recommendation.
- **No Terraform/CDK in the repo yet.** The compose file is the executable spec; IaC would
  be the next step for a real environment.

## Verification record

The stack was built and smoke-tested on 2026-11-06 with project `dme-prior-auth`:
all healthchecked services healthy, seed + policy ingestion complete, a new order
processed by the RabbitMQ consumer, document upload/download verified through an
858-byte MinIO round trip, and the gRPC smoke test passing. Full commands and evidence
are recorded in
[`progress/deployment-and-demo-readiness.md`](progress/deployment-and-demo-readiness.md).
