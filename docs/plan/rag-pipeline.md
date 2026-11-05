# Plan — RAG Pipeline

**Step:** 6 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Ground the prior-auth decision in real payer policy text: a small policy corpus,
embeddings from `nomic-embed-text`, vector search in Postgres, and citations the decision
workflow can reference.

## Decisions (recommended options chosen autonomously)

### 1. Vector store

| Option                               | Pros                                                          | Cons                                           |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| **pgvector in existing Postgres** ✅ | No new service, transactional with policy metadata, SQL joins | Needs a different Postgres image               |
| Qdrant container                     | Purpose-built ANN                                             | Another container + client, duplicated storage |
| In-Python cosine over JSONB          | Zero infrastructure                                           | Not how production systems do it; no index     |

**Chosen:** switch the compose image to **`pgvector/pgvector:pg16`** (same PG 16 data
directory — volume survives; extension added by migration). HNSW index on
`embedding vector_cosine_ops`. Documented trade-off: replaces the reused alpine image,
because the alpine variant has no pgvector package.

### 2. Chunking

| Option                                   | Pros                                                        | Cons                                    |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| **Heading-aware + paragraph packing** ✅ | Citations map to real policy sections; chunks stay coherent | Slightly more code                      |
| Fixed-size character window              | Trivial                                                     | Splits criteria lists, poor citations   |
| One chunk per document                   | Perfect context                                             | Too large for phi4-mini, weak retrieval |

**Chosen:** split on `##` headings, pack paragraphs to ≤1200 chars with 120-char overlap,
keep the section heading on each chunk.

### 3. Retrieval

| Option                                 | Pros                                       | Cons                                     |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| **Cosine similarity + top-k (k=4)** ✅ | Simple, explainable, enough for 3 policies | No lexical matching                      |
| Hybrid BM25 + vector                   | Better recall                              | Needs `tsvector` tuning and score fusion |
| LLM re-ranking                         | Best quality                               | Doubles latency on CPU                   |

**Chosen:** vector top-k with scores; hybrid search noted as the production next step.

## Corpus

Three synthetic-but-realistic policy documents (clearly marked demo):
`cpap.md` (E0601), `walker.md` (E0143), `wheelchair.md` (K0001) — coverage criteria,
documentation requirements, quantity limits, exclusions, coding notes. Front matter carries
title/payer/effective date/source so citations are meaningful.

## Implementation

- Prisma models `PolicyDocument` + `PolicyChunk` (`embedding Unsupported("vector(768)")`),
  handwritten migration adds `CREATE EXTENSION vector` + HNSW index
- `services/agent/scripts/ingest_policies.py`: parse front matter → chunk → embed (batches
  of 16) → upsert document, replace chunks, print summary (idempotent)
- `services/agent/app/rag.py`: `PolicyRetriever.search()` (pgvector cosine) +
  `list_documents()`; psycopg 3 async
- Endpoints: `POST /policies/search`, `GET /policies`
- Tests: heading-aware chunker unit tests; live verification after ingestion

## Definition of done

- [ ] pgvector extension + tables migrated; HNSW index present
- [ ] Ingestion embeds and stores all chunks; rerun is idempotent
- [ ] `POST /policies/search` returns the right policy section with a citation and score
- [ ] `pytest` green; docs + commit pushed
