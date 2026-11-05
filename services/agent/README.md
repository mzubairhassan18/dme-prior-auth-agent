# Agent Service (Python)

The autonomous agent service that runs the DME prior-authorization workflow.

**Status:** placeholder — real setup happens in the `agent-service-and-llm` step.

## Planned contents

- FastAPI / gRPC entrypoint called by the NestJS API
- LangGraph workflow: extract → retrieve policy → decide
- Ollama client (phi4-mini for generation, nomic-embed-text for embeddings)
- Redis-backed agent memory, RabbitMQ consumer (later steps)

See `docs/plan/` for the step-by-step decisions.
