# Plan — gRPC Contracts

**Step:** 9 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Expose the agent as a typed gRPC service and prove an inter-language contract:
NestJS (TypeScript) → Python worker over protobuf, alongside the existing REST and
RabbitMQ paths.

## Decisions (recommended options chosen autonomously)

### 1. Contract location

| Option                            | Pros                                        | Cons                           |
| --------------------------------- | ------------------------------------------- | ------------------------------ |
| **Repo-root `proto/agent.proto`** | One source of truth, both languages load it | Runtime path needs configuring |
| Duplicate proto per service       | Simple paths                                | Drift                          |

**Chosen:** `proto/agent.proto`, package `dme.agent.v1`. Python generates stubs at
build time; NestJS loads the `.proto` at runtime with `@grpc/proto-loader` (no codegen).

### 2. Transport / RPC style

- Unary `AnalyzeOrder` — one request, one decision; matches the workflow's semantics.
- Deadlines on the client (180s) because CPU inference is slow.
- gRPC status mapping: `NOT_FOUND`, `INVALID_ARGUMENT`, `UNAVAILABLE`, `INTERNAL`.

### 3. Server shape

- Dedicated process `python -m app.grpc_server` on port **50051** (`grpc.aio`), sharing
  `build_runtime` with the HTTP service and the RabbitMQ worker.
- Synchronous workflow code is already async, so the servicer just awaits it.
- Generated stubs are committed under `services/agent/app/grpc_generated/`; regenerate
  with `scripts/generate_grpc.py` after contract changes.

### 4. API surface

- `POST /api/v1/orders/:id/analyze-grpc` — REST façade that calls the gRPC server.
  This gives the web app a same-origin way to exercise the gRPC path and maps gRPC
  errors to RFC 7807 HTTP errors.
- Existing `POST :8000/orders/{id}/analyze` (REST, direct) and the RabbitMQ consumer
  stay unchanged.

## Contract sketch

```proto
service PriorAuthAgent {
  rpc AnalyzeOrder (AnalyzeOrderRequest) returns (AnalyzeOrderResponse);
}

message AnalyzeOrderResponse {
  string order_id = 1;
  string outcome = 2;
  string rationale = 3;
  string policy_reference = 4;
  repeated string missing_documents = 5;
  double confidence = 6;
  repeated PolicyCitation citations = 7;
  ClinicalExtraction extraction = 8;
  string model = 9;
  int32 latency_ms = 10;
}
```

## Files

```
proto/agent.proto                              shared contract
services/agent/scripts/generate_grpc.py        protoc + relative-import patch
services/agent/scripts/grpc_smoke.py           direct client smoke test
services/agent/app/grpc_server.py              async servicer + status mapping
services/agent/app/grpc_generated/             committed stubs
apps/api/src/agent/agent-client.service.ts     proto-loader client, deadline
apps/api/src/agent/agent.controller.ts         REST → gRPC façade
apps/api/src/agent/agent.module.ts
```

## Definition of done

- [ ] `grpc.aio` server starts on 50051 and reuses the analysis workflow
- [ ] Direct Python client returns a cited decision
- [ ] NestJS endpoint proxies to gRPC and maps errors to problem+json
- [ ] Tests cover proto response mapping; lint/build green
- [ ] Plan/progress docs + commit pushed
