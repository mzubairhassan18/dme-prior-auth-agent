# Plan — Agent Service and LLM Provider

**Step:** 5 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

A Python FastAPI service that turns free-text clinical notes into the structured facts a
prior-auth decision needs — the LLM layer everything else builds on. Fully local via Ollama.

## Decisions (recommended options chosen autonomously)

### 1. LLM runtime & provider layer

| Option                                       | Pros                                                                             | Cons                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Ollama native API + provider protocol** ✅ | Schema-enforced JSON (`format=<schema>`), fast local iterating, clean swap point | Slightly more custom code than an SDK             |
| Ollama OpenAI-compatible endpoint            | OpenAI SDK familiarity                                                           | JSON schema support is weaker; small models drift |
| llama.cpp directly                           | Minimal deps                                                                     | Reinventing a server                              |

**Chosen:** `OllamaProvider` talks to `POST /api/chat` (with `format` = Pydantic JSON schema,
`temperature=0.1`) and `POST /api/embed`. It implements a `ChatProvider` Protocol so an
OpenAI/Anthropic implementation can replace it without touching the extraction logic.

**Models:** `phi4-mini` (chat) + `nomic-embed-text` (embeddings, 768 dims) — already local.

### 2. Service framework

| Option                       | Pros                                      | Cons                                                |
| ---------------------------- | ----------------------------------------- | --------------------------------------------------- |
| **FastAPI + Pydantic v2** ✅ | Native async, typed schemas, OpenAPI free | —                                                   |
| Flask                        | Familiar                                  | Sync, no schema story                               |
| NestJS (share the API app)   | One language                              | Python is the job's AI stack (LangGraph/embeddings) |

**Chosen:** FastAPI. Runs on port **8000**; API stays on 3001.

### 3. Structured output strategy

| Option                                  | Pros                                     | Cons                                  |
| --------------------------------------- | ---------------------------------------- | ------------------------------------- |
| **JSON-schema constrained decoding** ✅ | Model output validates; no brittle regex | Needs Ollama ≥ 0.5                    |
| Prompt-only JSON + parse                | Works anywhere                           | Random parse failures on small models |
| Function calling                        | Idiomatic                                | Ollama tool support varies by model   |

**Chosen:** JSON schema in `format` + Pydantic validation after parsing; failures return
502 problem+json instead of silently corrupt data.

## Endpoints (this step)

- `GET /health` — service + Ollama reachability + configured models
- `POST /extract` — `{equipment_code, diagnosis_code, quantity, clinical_notes}` →
  `{extraction, model, latency_ms}` where extraction carries summary, evidence,
  missing information, urgency, confidence

Errors: RFC 7807-style problem+json (matching the API's error contract).

## Layout

```
services/agent/
  app/config.py      pydantic-settings (OLLAMA_*, PORT)
  app/llm.py         ChatProvider protocol + OllamaProvider
  app/schemas.py     request/response + ClinicalExtraction
  app/prompts.py     extraction system prompt
  app/extraction.py  orchestration + error handling
  app/main.py        FastAPI app, problem handlers, lifespan
  tests/             unit tests with a fake provider
```

## Definition of done

- [ ] venv + pinned `requirements.txt`
- [ ] Unit tests pass (`pytest`)
- [ ] Live `POST /extract` against phi4-mini returns schema-valid JSON
- [ ] Live `embed` call returns 768-dim vectors (proves the RAG path works)
- [ ] Docs + commit pushed
