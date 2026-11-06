# Progress — gRPC Contracts

**Step:** 9 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
proto/agent.proto                             dme.agent.v1 contract (unary AnalyzeOrder)
services/agent/scripts/generate_grpc.py       protoc + package-relative import patch
services/agent/app/grpc_generated/            committed Python stubs
services/agent/app/grpc_server.py             grpc.aio servicer + status mapping
services/agent/scripts/grpc_smoke.py          direct client smoke test
apps/api/src/agent/agent-client.service.ts    proto-loader client + 180s deadline
apps/api/src/agent/agent.controller.ts        REST → gRPC façade + error mapping
```

- The servicer reuses `build_runtime` and `AnalysisService`, so gRPC, REST, and the
  RabbitMQ worker run exactly the same workflow.
- The NestJS client loads `proto/agent.proto` at runtime (no TS codegen) and calls
  `localhost:50051`; path and address are configurable via `AGENT_PROTO_PATH` and
  `AGENT_GRPC_URL`.
- gRPC statuses map to HTTP: `INVALID_ARGUMENT → 400`, `NOT_FOUND → 404`,
  `UNAVAILABLE → 503`, `DEADLINE_EXCEEDED → 504`, everything else `502`.

## Verification

| Check            | Result                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Python tests     | **20/20** (new proto-mapping test) ✅                                                         |
| gRPC server      | `grpc.aio` listening on `0.0.0.0:50051` ✅                                                    |
| Direct gRPC call | E0143 walker order → `APPROVE`, cited `walker › Coverage criteria`, 4 citations, **56.8s** ✅ |
| NestJS → gRPC    | K0001 wheelchair order → `APPROVE`, cited `wheelchair › Coverage criteria`, **73.5s** ✅      |
| Error mapping    | malformed id → **400**, unknown order → **404** through the REST façade ✅                    |
| Build / lint     | Nest build + oxlint green ✅                                                                  |

Both gRPC-analyzed orders persisted decisions and audit rows like the REST path.

## Decisions in practice

- **One proto, two languages**: Python codegen and runtime proto-loading both point at
  the repo-root contract, so a field rename breaks compilation/tests immediately.
- **Unary RPC with an explicit deadline**: analysis is a long request; the 180s client
  deadline is longer than any observed CPU run (49–77s) but still bounded.
- **Committed stubs**: `scripts/generate_grpc.py` regenerates them, but the service does
  not require protoc at runtime.
- **Same service object**: gRPC does not duplicate prompt/retrieval/persistence logic.
- **REST façade**: the web app only needs the Nest API; the façade also demonstrates
  translating transport errors into RFC 7807 responses.

## Deviations / gotchas

- `grpc_tools.protoc` emits `import agent_pb2`, which breaks package imports; the
  generator rewrites it to `from . import agent_pb2`.
- The API resolves the proto relative to its working directory (`apps/api`) by default;
  containers must set `AGENT_PROTO_PATH` to the copied contract.
- The model returned `confidence: 1.0` for the wheelchair order despite prompt guidance;
  the schema allows the full `[0, 1]` range, and the UI presents it as model confidence
  rather than a calibrated probability.
- Windows console renders `›` as `?`; stored/API values remain UTF-8.

## Next step

`realtime-dashboard` — Socket.IO gateway in NestJS, agent publishes `order.analyzed`,
and the web dashboard updates statuses live instead of polling.
