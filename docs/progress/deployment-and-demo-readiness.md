# Progress — Deployment & Demo Readiness

**Step:** 13 of 13 · **Status:** complete · **Date:** 2026-11-06

## What was delivered

- Production Dockerfiles for the API, web, and agent (runtime-only Python requirements).
- `docker-compose.prod.yml`: web, API, agent REST/gRPC/consumer, Postgres + pgvector,
  RabbitMQ, Redis, MinIO, optional Ollama profile, healthchecks, named volumes, and
  localhost-bound ports.
- `.env.prod.example` with every tunable value; real env files stay gitignored.
- Root `.dockerignore` to keep dependencies, build output, virtualenvs, git history, and
  secrets out of image contexts.
- Separate `MINIO_ENDPOINT` (internal uploads) and `MINIO_PUBLIC_ENDPOINT` (browser-signed
  download URLs) so presigned URLs work across the Docker boundary.
- `docs/deployment.md`: local runbook, demo script, env table, AWS service mapping,
  security/HA gaps, and operations commands.
- README quick start, local-development section, testing section, and deployment link.
- Python dependencies split into runtime and dev files; `PyYAML`, previously an implicit
  policy-ingestion dependency, is now pinned. The runtime image uses plain `uvicorn`
  (no reload extras), while watchfiles stays a dev-only convenience.
- `protobuf` is pinned in the runtime requirements because the checked-in gRPC stubs
  import `google.protobuf` directly; it was previously only pulled in transitively by
  the dev-only `grpcio-tools`.
- API Dockerfile installs OpenSSL for Prisma, and the MinIO clients pin `us-east-1` so
  presigning never attempts a bucket-region lookup through the browser-facing endpoint.

## Verification

Verified on 2026-11-06 with the production-like compose project `dme-prior-auth`:

- `docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet` passes.
- Images build: `dme-api:local` 2.02 GB, `dme-web:local` 2.06 GB, `dme-agent:local`
  346 MB. The API image contains OpenSSL 3.0.22 and the region-pinned storage code;
  the agent image imports protobuf 7.36.2.
- All nine services are up; the eight with healthchecks report healthy (the event
  consumer deliberately has no HTTP healthcheck): Postgres, RabbitMQ, Redis, MinIO,
  API, web, agent REST, agent gRPC, and the event consumer.
- Fresh prod volumes: API migrations and MinIO bucket bootstrap succeed; seed creates
  **2 patients / 3 orders**; policy ingestion creates **3 documents / 18 chunks**.
- Event flow: a new order moves `SUBMITTED → ANALYZING → DECISION_READY` through
  RabbitMQ and the agent consumer. Order `261ebb2a-a546-427f-b67b-7a8f231e0c46`
  returns `NEEDS_MORE_INFO`, policy `cpap › Coverage criteria`, confidence `0.9`, with
  two missing-document items.
- Document flow: upload returns an 858-byte document; the presigned URL is signed for
  `http://localhost:9000`, and the downloaded file is also **858 bytes**. API logs no
  longer show the MinIO connection error.
- gRPC smoke (`python -m scripts.grpc_smoke`) passes inside `agent-grpc`: same outcome,
  confidence `0.9`, citations returned, `latency_ms` 78,497. RabbitMQ queues drain to
  `0` messages after the run.
- Local suites: build 3/3, lint 0 errors, API unit 2/2, API e2e 9/9, Python pytest 21/21.
- Screenshots refreshed from this stack: `docs/assets/dashboard.png` and
  `docs/assets/order-detail.png`.

## Follow-ups

- GitHub Actions remains blocked by the account-level billing lock documented in
  `progress/integration-testing-and-ci.md`. The workflow was updated to install
  `requirements-dev.txt`.
- A real deployment still needs auth/RBAC, Secrets Manager, TLS, private networking, and
  HIPAA review; see `docs/deployment.md`.
