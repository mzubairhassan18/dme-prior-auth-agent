# Progress — Prior-Auth Agent Workflow

**Step:** 7 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
services/agent/app/repository.py     order/patient fetch, status + decision + audit writes
services/agent/app/workflow.py       LangGraph state graph, citation guard, AnalysisService
services/agent/app/prompts.py        decision system prompt + grounded decision prompt
services/agent/app/schemas.py        DecisionRecommendation, PolicyCitation, AnalysisResponse
services/agent/app/main.py           workflow compiled in lifespan, /orders/{id}/analyze
services/agent/tests/test_workflow.py  graph tests with fake provider/retriever/repository
```

Graph (compiled once at FastAPI startup):

```
START → mark_analyzing → extract → retrieve → decide → persist → END
```

- `extract` — step 5's schema-constrained phi4-mini extraction
- `retrieve` — step 6's pgvector search, top 4 policy chunks
- `decide` — second phi4-mini call restricted to `DecisionRecommendation` JSON schema
- `persist` — upserts the decision, sets `DECISION_READY`, writes audit rows in the
  same transaction
- any failure — `FAILED` status + `analysis_failed` audit row, then a typed error
  (`502` model/workflow, `503` database, `404` unknown order)

## Verification

| Check                | Result                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `pytest`             | **15/15** (4 new: happy path, citation fallback, provider failure, unknown order) ✅           |
| Live APPROVE         | seeded E0601 order → `APPROVE`, confidence **0.95**, **76.9s** end-to-end ✅                   |
| Citation             | cited `cpap › Documentation requirements`; 4 cpap chunks returned (top score 0.719) ✅         |
| Persistence          | order status `DECISION_READY`; decision row (`phi4-mini`, 0.95) ✅                             |
| Audit trail          | `analysis_started` + `decision_recorded` rows with decision id/outcome/confidence ✅           |
| Live NEEDS_MORE_INFO | thin sleep-apnea order → `NEEDS_MORE_INFO`, missing **"Results of the sleep study"**, 49.0s ✅ |
| Citation guard       | unknown model references are replaced by the top chunk label before persisting ✅              |
| Error mapping        | RFC 7807 `404` / `502` / `503` handlers at the agent boundary ✅                               |

The thin test order was removed afterwards; the other two seeded orders remain
`SUBMITTED` for the event-driven step.

## Decisions in practice

- **LangGraph over a hand-rolled pipeline**: each concern is a named node, so retries,
  checkpoints, or a human-approval interrupt can be inserted later without rewriting
  the flow.
- **Two structured LLM calls**: extraction stays reusable by `/extract`; the decision
  call receives only extracted facts + retrieved policy, which keeps the prompt small
  enough for a CPU-hosted 4B model.
- **Grounding instead of trust**: the model must cite a retrieved section label; an
  unknown label falls back to the highest-scoring chunk, so the database never stores
  a fabricated reference.
- **Failure is visible**: orders move `SUBMITTED → ANALYZING → DECISION_READY` or
  `FAILED`, and every transition lands in `audit_logs`.
- **Idempotent analysis**: decisions are upserted by `order_id`, so re-running an
  analysis replaces the recommendation rather than duplicating it.

## Deviations / gotchas

- Prisma's `@default(uuid())` is generated **client-side**, so the raw-SQL inserts from
  the agent had to supply ids explicitly (`audit_logs`, `authorization_decisions`).
  Caught by the first live run and fixed.
- `psycopg` returns `UUID` objects, which `Jsonb` cannot serialize; decision ids are
  converted to strings before writing audit detail.
- LangGraph state carries dataclasses (`OrderContext`, `RetrievedChunk`). That is fine
  for in-process execution, but adding a checkpointer later means switching to
  serializable state (or configuring serializers).
- The model's citation separator (`›`) is preserved end-to-end; PowerShell console
  output may display it as `?` but the API response and Postgres value are UTF-8.

## Next step

`event-driven-messaging` — publish `order.created` from the API, consume it in the
agent service via RabbitMQ, and drive status transitions asynchronously.
