# Plan — Event-Driven Messaging

**Step:** 8 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Decouple order intake from AI analysis. Creating an order publishes an `order.created`
event; a dedicated agent worker consumes it, runs the LangGraph workflow, and moves the
order through `ANALYZING → DECISION_READY` without blocking the HTTP request.

## Decisions (recommended options chosen autonomously)

### 1. Broker

| Option                      | Pros                                                      | Cons                                               |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| **RabbitMQ 4 (management)** | Mature routing, DLX, management UI, matches the job stack | Extra container                                    |
| Kafka                       | Great for event sourcing                                  | Heavy for a local demo, no natural per-queue retry |
| Redis Streams               | Already adding Redis later                                | Weaker routing/operability story                   |

**Chosen:** RabbitMQ with a topic exchange `dme.events`, a durable work queue, and a
dead-letter queue. Enabled by default in `docker-compose.yml`.

### 2. Publish semantics

| Option                                | Pros                      | Cons                            |
| ------------------------------------- | ------------------------- | ------------------------------- |
| **Publish after commit, best effort** | Simple, keeps intake fast | A broker outage loses the event |
| Transactional outbox + relay          | Guarantees delivery       | More moving parts               |

**Chosen:** publish after the database transaction commits, in confirm mode. Failures
are logged but never fail the intake request. The trade-off is documented and an
outbox is the natural next iteration.

### 3. Consumer semantics

- Queue `agent.order-created`, prefetch **1** (the model is CPU-bound; parallel
  analyses would starve each other).
- Manual acks via `message.process(requeue=False)`: success → ack, any failure →
  reject to `dme.dlx` (`agent.order-created.dlq`). The HTTP endpoint remains for
  manual retries.
- At-least-once delivery + idempotent upsert of decisions means re-delivery is safe.
- The worker is a separate process: `python -m app.consumer`.

## Contract

```json
{
  "eventId": "uuid",
  "eventType": "order.created",
  "occurredAt": "2026-11-06T00:00:00.000Z",
  "data": {
    "orderId": "uuid",
    "patientId": "uuid",
    "equipmentCode": "E0601",
    "diagnosisCode": "G47.33",
    "quantity": 1
  }
}
```

- `packages/shared/src/schemas/event.ts` — Zod schema + type used by the API.
- `services/agent/app/events.py` — matching Pydantic model in the consumer.

## Files

```
docker-compose.yml                     rabbitmq:4-management-alpine + volume + healthcheck
apps/api/src/events/events.module.ts   global publisher module
apps/api/src/events/events.service.ts  lazy confirm channel, exchange, reconnect
apps/api/src/orders/orders.service.ts  publish order.created after commit
packages/shared/src/schemas/event.ts   shared event contract
services/agent/app/config.py           RABBITMQ_URL / exchange / queue settings
services/agent/app/events.py           envelope + message schema
services/agent/app/bootstrap.py        shared provider/retriever/graph wiring
services/agent/app/consumer.py         robust consumer with DLQ, prefetch 1
services/agent/scripts/run_consumer.py CLI entry point
```

## Definition of done

- [ ] RabbitMQ healthy in compose; management UI reachable
- [ ] API publishes a confirmed event on `POST /orders`
- [ ] Agent worker consumes, analyzes, and persists the decision
- [ ] Failure path rejects to the DLQ; manual `/analyze` still works
- [ ] Unit tests green; live event end-to-end verified
- [ ] Plan/progress docs + commit pushed
