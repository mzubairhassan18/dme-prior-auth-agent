# Plan — Caching & Document Storage

**Step:** 11 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Make the read path fast and add a realistic clinical-document workflow:

- **Redis** caches order reads with explicit invalidation, so the dashboard and detail
  views stay quick while the agent writes decisions.
- **MinIO** stores uploaded clinical documents (PDF/PNG/JPEG); Postgres keeps the
  metadata and the browser downloads through short-lived presigned URLs.
- A new order-detail page ties it together: decision, citations, and documents.

## Decisions (recommended options chosen autonomously)

### 1. Cache

| Option                            | Pros                                                                        | Cons                                             |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| **Redis + cache-aside (ioredis)** | Shared across API instances, TTL + explicit invalidation, matches job stack | Extra container                                  |
| In-process LRU                    | No dependency                                                               | Inconsistent across instances, no key inspection |
| No cache                          | Simplest                                                                    | Repeated dashboard reads hit Postgres            |

**Chosen:** cache-aside in `OrdersService` with TTLs (15s list, 30s detail). Keys are
versioned by pattern `orders:list:*` / `orders:item:*` and invalidated with `SCAN` on
create, upload, and every realtime `order.*` event. If Redis is down, calls fall through
to Postgres (log once, never fail the request).

### 2. Object storage

| Option             | Pros                                                    | Cons                             |
| ------------------ | ------------------------------------------------------- | -------------------------------- |
| **MinIO (S3 API)** | Local, console UI, presigned URLs, same SDK shape as S3 | Extra container                  |
| Disk volume        | No dependency                                           | Not shareable, no presigned URLs |
| Base64 in Postgres | Simple                                                  | Bloats DB, no streaming          |

**Chosen:** MinIO with bucket `dme-clinical-documents`, bootstrapped by the API on
startup. Uploads are held in memory (5 MB limit), validated by content type and
extension, and streamed to a key `orders/<orderId>/<uuid>-<safe-name>`.

### 3. API shape

| Method | Path                                           | Notes                                   |
| ------ | ---------------------------------------------- | --------------------------------------- |
| POST   | `/api/v1/orders/:id/documents`                 | multipart `file`; 5 MB; PDF/PNG/JPEG    |
| GET    | `/api/v1/orders/:id/documents`                 | metadata list                           |
| GET    | `/api/v1/orders/:id/documents/:documentId/url` | 15-minute presigned GET                 |
| GET    | `/api/v1/orders/:id`                           | now includes `documents` (newest first) |

Metadata lives in a new `clinical_documents` table (FK cascade, unique storage key).
The web app never sees MinIO credentials — only presigned URLs.

### 4. UI

- New `/orders/[id]` detail page: patient, order, decision rationale + cited policy,
  missing documents, citation list, document upload and download.
- Dashboard rows link to the detail page and keep showing decision badges.
- Upload/download use TanStack mutations/queries; socket events already invalidate
  `['order', id]`, so a status change refreshes the detail page live.

## Files

```
docker-compose.yml                                  redis:7-alpine + minio + volumes
apps/api/src/cache/cache.service.ts                 ioredis client, JSON helpers, SCAN invalidation
apps/api/src/cache/cache.module.ts
apps/api/src/orders/orders.service.ts               cache-aside + document include + invalidation
apps/api/src/realtime/realtime-events.consumer.ts   invalidate cache before broadcasting
apps/api/src/storage/storage.service.ts             MinIO client, bucket bootstrap, presign
apps/api/src/documents/documents.service.ts         validation + upload/list/presign
apps/api/src/documents/documents.controller.ts      multipart endpoints
apps/api/prisma/schema.prisma                       ClinicalDocument model
apps/api/prisma/migrations/20261106110000_clinical_documents/migration.sql
packages/shared/src/schemas/document.ts             ClinicalDocument contract
packages/shared/src/schemas/order.ts                documents array
apps/web/src/app/orders/[id]/page.tsx               detail + upload/download
apps/web/src/lib/api.ts                             upload / list / presign helpers
apps/web/src/app/page.tsx                           detail link
```

## Definition of done

- [ ] Redis cache hit/miss visible via keys and TTL; create/event/upload invalidates
- [ ] MinIO bucket auto-created; upload persists metadata + object
- [ ] Presigned URL downloads the exact uploaded bytes
- [ ] Order detail page uploads and lists documents, downloads via presign
- [ ] Cache/storage outages degrade gracefully (no 500s)
- [ ] Tests/build/lint green; live browser verification
- [ ] Plan/progress docs + commit pushed
