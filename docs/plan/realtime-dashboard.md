# Plan — Realtime Dashboard

**Step:** 10 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Replace 5-second polling with a live dashboard: order status changes appear as the agent
works, pushed over Socket.IO, while polling remains as a fallback when the socket is
down.

## Decisions (recommended options chosen autonomously)

### 1. Push transport

| Option                          | Pros                                                                | Cons                             |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| **Socket.IO gateway in NestJS** | First-class Nest support, reconnects, namespaces, matches job stack | Extra dependency                 |
| Server-Sent Events              | Simple, HTTP-only                                                   | One-way, no room/namespace model |
| Raw WebSocket                   | Minimal                                                             | Reconnect/fan-out plumbing       |

**Chosen:** `@nestjs/websockets` + `@nestjs/platform-socket.io`, namespace `/orders`.

### 2. Where events originate

- Agent publishes `order.analyzing` / `order.analyzed` / `order.failed` to the same
  `dme.events` RabbitMQ exchange.
- The API consumes `order.*` into its own durable queue (`api.dashboard`) and relays to
  Socket.IO clients. It also relays `order.created` published by the API itself, so the
  browser has one consistent event stream.
- Publishing stays best effort: a broker outage cannot fail analysis or intake.

### 3. Client behaviour

- `useOrderEvents()` opens the socket, tracks connection state, and invalidates
  TanStack Query caches on every event (`['orders']` and `['order', id]`).
- Dashboard shows a **Live** indicator when connected; polling falls back to every 10s
  when disconnected.
- A compact banner reports the latest event (created / analyzing / decision ready).

## Event flow

```
POST /orders ─► API publishes order.created ─┐
                                             ├─► dme.events ─► api.dashboard queue ─► Socket.IO ─► browser
agent workflow ─► order.analyzing ───────────┤
                └► order.analyzed/failed ────┘
```

## Files

```
services/agent/app/publisher.py                aio-pika event publisher (lazy, resilient)
services/agent/app/workflow.py                 publishes analyzing + completion/failure
services/agent/app/bootstrap.py                wires publisher into the runtime
apps/api/src/realtime/orders.gateway.ts        Socket.IO gateway, /orders namespace
apps/api/src/realtime/realtime-events.consumer.ts  RabbitMQ → gateway relay
apps/api/src/realtime/realtime.module.ts
apps/web/src/lib/use-order-events.ts           socket hook + query invalidation
apps/web/src/app/page.tsx                      live indicator, fallback polling, last event
```

## Definition of done

- [ ] Agent publishes status events for every analysis path (REST, gRPC, queue)
- [ ] API relays `order.*` to connected browsers; CORS works from :3000
- [ ] Dashboard shows created → analyzing → decision ready without a reload
- [ ] Polling fallback works when the socket is disconnected
- [ ] Tests/build/lint green; live browser verification
- [ ] Plan/progress docs + commit pushed
