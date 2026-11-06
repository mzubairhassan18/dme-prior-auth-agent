# Plan — Prior-Auth Agent Workflow

**Step:** 7 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Turn the pieces into an actual agent: a LangGraph workflow that reads an order, extracts
the clinical facts, retrieves payer policy, decides **APPROVE / NEEDS_MORE_INFO / DENY**
with citations, and persists the recommendation + audit trail.

## Decisions (recommended options chosen autonomously)

### 1. Orchestration

| Option                      | Pros                                                                         | Cons                                             |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| **LangGraph StateGraph** ✅ | Explicit nodes/edges, retries and human-in-the-loop later, matches job stack | Extra dependency                                 |
| Hand-rolled async pipeline  | No deps                                                                      | No durable graph/checkpoint story; less relevant |
| LangChain chain             | Familiar                                                                     | Less control over branching/persistence          |

**Chosen:** LangGraph `StateGraph` with typed state and async nodes.

### 2. Decision model

| Option                                            | Pros                                                   | Cons                               |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| **JSON-schema constrained LLM classification** ✅ | Small model friendly (3 classes + fields), explainable | Needs good prompt + citation guard |
| Free-form rationale only                          | Rich text                                              | Not machine-actionable             |
| Rules engine over extracted fields                | Deterministic                                          | Cannot read policy nuance          |

**Chosen:** `DecisionRecommendation` Pydantic schema (`outcome`, `rationale`,
`policy_reference`, `missing_documents`, `confidence`) constrained through Ollama.

### 3. Graph shape

```
START → mark_analyzing → extract → retrieve → decide → persist → END
                     ↘ (any failure) → mark_failed
```

- `extract` reuses step 5's extraction service (phi4-mini).
- `retrieve` reuses step 6's pgvector search (top 4).
- `decide` is a second phi4-mini call grounded in numbered policy excerpts.
- Citation guard: if the model cites a label that wasn't retrieved, fall back to the
  top-scoring chunk's label (no hallucinated references in the DB).
- `persist` upserts `authorization_decisions`, sets order status `DECISION_READY`, and
  appends audit rows (`analysis_started`, `decision_recorded`, or `analysis_failed`).

## API (agent service)

- `POST /orders/{order_id}/analyze` → loads the order/patient, runs the graph, returns
  decision + extraction + citations + latency
- 404 problem+json for unknown order, 502 for model failures, 503 for index failures

## Files

```
services/agent/app/repository.py   order fetch + status/decision/audit writes (psycopg)
services/agent/app/workflow.py     state, prompts, nodes, graph factory, analysis runner
services/agent/app/schemas.py      DecisionRecommendation, AnalysisResponse
services/agent/app/main.py         lifespan-compiled workflow + endpoint
services/agent/tests/test_workflow.py  fake provider/retriever/repository
```

## Definition of done

- [ ] LangGraph compiled at startup; workflow testable with fakes
- [ ] `pytest` covers graph happy path + citation fallback
- [ ] Live analysis of a seeded order returns a cited decision and persists it
- [ ] Order status, decision row, and audit rows verified in Postgres
- [ ] Docs + commit pushed
