# Progress — RAG Pipeline

**Step:** 6 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
services/agent/policies/               3 synthetic payer policies (cpap, walker, wheelchair)
services/agent/app/chunking.py         heading-aware chunker (≤1200 chars, 120 overlap)
services/agent/app/rag.py              PolicyRetriever (pgvector cosine) + list_policy_documents
services/agent/scripts/ingest_policies.py  front matter → chunk → embed → upsert, idempotent
apps/api/prisma/schema.prisma          PolicyDocument + PolicyChunk (Unsupported vector(768))
apps/api/prisma/migrations/20261106093000_policy_rag/
                                       CREATE EXTENSION vector, tables, HNSW cosine index
docker-compose.yml                     postgres → pgvector/pgvector:pg16
```

New endpoints on the agent service:

| Method | Path               | Notes                                                            |
| ------ | ------------------ | ---------------------------------------------------------------- |
| GET    | `/policies`        | documents + effective date + chunk counts                        |
| POST   | `/policies/search` | `{query, top_k}` → scored chunks with document/section citations |

## Verification

| Check                 | Result                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Image switch          | `pgvector/pgvector:pg16` healthy, **volume preserved** (3 orders intact) ✅                     |
| Migration             | `prisma migrate deploy` applied; extension **0.8.7** ✅                                         |
| Index                 | `policy_chunks_embedding_idx` HNSW `vector_cosine_ops` ✅                                       |
| Ingestion             | 3 documents, **18 chunks**, all 768-dim ✅                                                      |
| Idempotency           | rerun → still 3 docs / 18 chunks ✅                                                             |
| CPAP query            | top hits all from `cpap` policy: Documentation (0.811), Coverage (0.795), Exclusions (0.733) ✅ |
| Walker query          | top hits from `walker` policy: Coverage (0.792), Documentation (0.740) ✅                       |
| Search latency        | **258ms** (embedding + pgvector) ✅                                                             |
| `pytest`              | 11/11 ✅                                                                                        |
| `pnpm build` / `lint` | green ✅                                                                                        |

## Decisions in practice

- **pgvector over a separate vector DB**: policy text and metadata live in the same
  Postgres already used by the API, and the migration is fully versioned.
- **Handwritten migration**: Prisma has no native vector type; the schema models it as
  `Unsupported("vector(768)")` and the SQL adds the extension, HNSW index, and FK.
- **Heading-aware chunks**: every retrieved chunk carries its section heading, so
  decisions cite e.g. "Medicare CPAP Coverage Criteria → Coverage criteria".
- **Idempotent ingestion**: document upsert + chunk replacement per document; safe to
  rerun after editing policy text.

## Deviations / gotchas

- Replaced the reused `postgres:16-alpine` with `pgvector/pgvector:pg16`. Alpine has no
  pgvector package; the pgvector image is PG 16, so the existing data directory was
  reused without a dump/restore.
- **Windows + psycopg async**: psycopg's async connection refuses the default
  `ProactorEventLoop`. The service runs sync psycopg in `asyncio.to_thread` (portable),
  and the ingestion CLI selects a `SelectorEventLoop` on Windows.
- Embedding dimension is fixed at 768 (nomic-embed-text); changing models requires a
  migration of the vector column.

## Next step

`prior-auth-agent-workflow` — LangGraph graph that combines extraction + retrieval into a
cited APPROVE / NEEDS_MORE_INFO / DENY recommendation and persists it.
