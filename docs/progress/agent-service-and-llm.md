# Progress — Agent Service and LLM Provider

**Step:** 5 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
services/agent/
  app/config.py      pydantic-settings (OLLAMA_*, AGENT_PORT), .env support
  app/llm.py         ChatProvider protocol + OllamaProvider (httpx.AsyncClient)
  app/schemas.py     ExtractionRequest/ClinicalExtraction/ExtractionResponse/Embed*
  app/prompts.py     extraction system prompt + order-context prompt builder
  app/extraction.py  orchestration: schema -> model -> Pydantic validation
  app/main.py        FastAPI app, lifespan-managed provider, RFC 7807 handlers
  tests/             3 extraction tests + 4 API tests (fake provider)
  requirements.txt   pinned Python deps (installed with uv)
  .env.example       OLLAMA_BASE_URL / models / port
```

Endpoints on `http://localhost:8000`:

| Method | Path       | Notes                                                               |
| ------ | ---------- | ------------------------------------------------------------------- |
| GET    | `/health`  | `{status, ollama, chat_model, embed_model}`                         |
| POST   | `/extract` | schema-constrained extraction, 502 problem+json on provider failure |
| POST   | `/embed`   | up to 32 texts → 768-dim vectors (proves RAG path)                  |

## Verification

| Check                       | Result                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `pytest`                    | **7/7 passed** ✅                                                                |
| venv                        | Python 3.13 + uv, pinned requirements ✅                                         |
| `GET /health` live          | `{"status":"ok","ollama":"up","chat_model":"phi4-mini",...}` ✅                  |
| `POST /extract` live (cold) | schema-valid JSON, **45.7s** (CPU) ✅                                            |
| `POST /extract` live (warm) | CPAP device description, **no false missing docs**, confidence 0.9, **26.1s** ✅ |
| `POST /embed` live          | `nomic-embed-text`, **768 dimensions** ✅                                        |
| Error contract              | 422 validation + 502 provider failures as `application/problem+json` ✅          |

## Decisions in practice

- **Native Ollama API** with `format=<JSON schema>` — phi4-mini returned schema-valid
  output on the first try; Pydantic validation is the second safety net.
- **Provider protocol** (`complete_json`, `embed`, `ping`) isolates the model vendor;
  swapping to OpenAI later is one class, not a rewrite.
- Extraction result carries `clinical_summary`, `supporting_evidence`,
  `missing_information`, `urgency`, `confidence` — exactly what the decision workflow
  in step 7 will consume.
- Tests use a fake provider, so `pytest` never needs a running model.

## Deviations / gotchas

- First prompt iteration described E0601 as "sleep study equipment" and listed sleep
  study results as missing even though AHI was given. Added an HCPCS reference line and
  a "do not list facts already present" rule; warm rerun fixed both.
- Uvicorn takes ~2 minutes to bind on this Windows machine (Defender scanning the fresh
  venv); subsequent requests are fast. Not a code issue.
- CPU inference: 26–46s per extraction. The async pipeline and 5s dashboard polling in
  the demo make this tolerable; step 8's event flow keeps the request path non-blocking.

## Next step

`rag-pipeline` — policy corpus, pgvector storage, and retrieval-augmented context for the
decision workflow.
