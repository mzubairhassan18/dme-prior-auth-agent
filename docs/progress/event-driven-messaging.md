# Progress — Event-Driven Messaging

**Step:** 8 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
docker-compose.yml                       rabbitmq:4-management-alpine (5672 / 15672) + volume
packages/shared/src/schemas/event.ts     OrderCreatedEvent Zod contract + envelope
apps/api/src/events/events.service.ts    confirm-channel publisher, lazy reconnect
apps/api/src/events/events.module.ts     global module
apps/api/src/orders/orders.service.ts    publishes order.created after commit
services/agent/app/events.py             Pydantic mirror of the contract (camelCase aliases)
services/agent/app/bootstrap.py          shared object graph for HTTP + worker
services/agent/app/consumer.py           robust consumer, prefetch 1, DLQ
services/agent/scripts/run_consumer.py   CLI entry point (`python -m app.consumer`)
```

Flow:

```
POST /orders ──► Postgres transaction (order + audit) ──► publish order.created
                                                              │
                                            dme.events (topic)│
                                                              ▼
                          agent.order-created ──► LangGraph workflow ──► decision + audit
                                 │ failure
                                 ▼
                          dme.dlx ──► agent.order-created.dlq
```

## Verification

| Check          | Result                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| RabbitMQ       | healthy; management UI on `:15672` (`dme` / `dme`) ✅                                                     |
| Publisher      | API connected and published `order.created` with message id, persistent + confirm mode ✅                 |
| Consumer       | `agent.order-created` shows **1 consumer**, prefetch 1; DLQ declared and bound ✅                         |
| End-to-end     | intake returned `201` immediately; event consumed; order auto-analyzed in **64.5s** → `APPROVE` ✅        |
| Persistence    | decision row (confidence 0.95) + audit `created`, `analysis_started`, `decision_recorded` ✅              |
| Citation guard | model emitted `[cpap › Coverage criteria]`; guard normalized/grounded it to `cpap › Coverage criteria` ✅ |
| DLQ path       | malformed event → `agent.order-created.dlq` (1 message, 0 consumers), then purged ✅                      |
| Tests          | agent **19/19**, API unit **2/2**, API e2e **3/3** ✅                                                     |
| Build / lint   | turbo build + oxlint green ✅                                                                             |

The event test order was removed afterwards; the seeded orders are unchanged.

## Decisions in practice

- **RabbitMQ + topic exchange** keeps the API unaware of which workers exist; a second
  consumer (notifications, analytics) can bind without changing intake.
- **Publish after commit, not inside it** avoids consumers reading uncommitted orders.
  Failures are logged and never fail the intake; the manual `/analyze` endpoint remains
  an explicit retry path. A transactional outbox is the documented next step if
  delivery must be guaranteed.
- **Prefetch 1**: the CPU-hosted model takes ~30–60s per call, so parallel deliveries
  would only thrash Ollama.
- **DLQ + manual acks**: poison messages are preserved for inspection instead of
  looping forever; the decision upsert makes redelivery idempotent.
- **One shared contract**: Zod on the API side, Pydantic with camelCase aliases on the
  Python side, so a field rename fails fast in tests rather than at runtime.

## Deviations / gotchas

- `amqplib` is now **2.x** and ships its own TypeScript types; installing
  `@types/amqplib` was unnecessary and removed.
- The consumer must run as its own process (`python -m app.consumer`); uvicorn does not
  start it. Both share `app.bootstrap.build_runtime`.
- The live model wrapped its citation in brackets once. The guard originally only did
  exact matches and fell back to the top chunk (same section here); it now strips
  brackets/quotes/whitespace and case-folds before comparing, covered by a unit test.
- Logs render `›` as `?` in the Windows console due to code page, not data corruption.

## Next step

`grpc-contracts` — define the agent analysis contract in protobuf, expose a gRPC server
from the Python service, and call it from NestJS alongside the REST path.
