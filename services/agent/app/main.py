import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .extraction import extract_clinical_data
from .llm import ChatProvider, OllamaProvider, ProviderError
from .rag import PolicyRetriever, RetrievalError, list_policy_documents
from .schemas import (
    EmbedRequest,
    EmbedResponse,
    ExtractionRequest,
    ExtractionResponse,
    PolicyDocumentRef,
    PolicyDocumentSummary,
    PolicySearchRequest,
    PolicySearchResponse,
    PolicySearchResult,
)

logger = logging.getLogger("agent")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.provider = OllamaProvider(settings)
    logger.info(
        "agent started — chat=%s embed=%s",
        settings.ollama_chat_model,
        settings.ollama_embed_model,
    )
    yield
    await app.state.provider.aclose()


app = FastAPI(
    title="DME Prior Auth Agent",
    version="0.1.0",
    description="Local LLM service for DME prior-authorization workflows",
    lifespan=lifespan,
)


def get_provider(request: Request) -> ChatProvider:
    return request.app.state.provider


ProviderDep = Annotated[ChatProvider, Depends(get_provider)]


def problem(
    *,
    status: int,
    title: str,
    detail: str | None = None,
    instance: str | None = None,
    errors: list[dict[str, str]] | None = None,
) -> JSONResponse:
    """RFC 7807 response, matching the NestJS API's error contract."""
    body: dict[str, object] = {"type": "about:blank", "title": title, "status": status}
    if detail:
        body["detail"] = detail
    if instance:
        body["instance"] = instance
    if errors:
        body["errors"] = errors
    return JSONResponse(
        status_code=status, content=body, media_type="application/problem+json"
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = [
        {
            "path": ".".join(str(part) for part in error["loc"][1:]) or "(root)",
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    return problem(
        status=422,
        title="Validation failed",
        instance=request.url.path,
        errors=errors,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return problem(
        status=exc.status_code, title=str(exc.detail), instance=request.url.path
    )


@app.exception_handler(ProviderError)
async def provider_exception_handler(
    request: Request, exc: ProviderError
) -> JSONResponse:
    logger.warning("provider error: %s", exc)
    return problem(
        status=502,
        title="LLM provider error",
        detail=str(exc),
        instance=request.url.path,
    )


@app.exception_handler(RetrievalError)
async def retrieval_exception_handler(
    request: Request, exc: RetrievalError
) -> JSONResponse:
    logger.warning("retrieval error: %s", exc)
    return problem(
        status=503,
        title="Policy index unavailable",
        detail=str(exc),
        instance=request.url.path,
    )


@app.get("/health")
async def health(provider: ProviderDep) -> dict[str, str]:
    ollama_up = await provider.ping()
    return {
        "status": "ok" if ollama_up else "degraded",
        "ollama": "up" if ollama_up else "down",
        "chat_model": settings.ollama_chat_model,
        "embed_model": settings.ollama_embed_model,
    }


@app.post("/extract", response_model=ExtractionResponse)
async def extract(
    payload: ExtractionRequest, provider: ProviderDep
) -> ExtractionResponse:
    started = time.perf_counter()
    extraction = await extract_clinical_data(provider, payload)
    return ExtractionResponse(
        extraction=extraction,
        model=settings.ollama_chat_model,
        latency_ms=round((time.perf_counter() - started) * 1000),
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(payload: EmbedRequest, provider: ProviderDep) -> EmbedResponse:
    embeddings = await provider.embed(payload.texts)
    return EmbedResponse(
        model=settings.ollama_embed_model,
        dimensions=len(embeddings[0]),
        embeddings=embeddings,
    )


@app.get("/policies", response_model=list[PolicyDocumentSummary])
async def policies() -> list[PolicyDocumentSummary]:
    rows = await list_policy_documents(settings)
    return [
        PolicyDocumentSummary(
            slug=row.slug,
            title=row.title,
            payer=row.payer,
            effective_date=row.effective_date,
            source=row.source,
            chunks=row.chunks,
        )
        for row in rows
    ]


@app.post("/policies/search", response_model=PolicySearchResponse)
async def search_policies(
    payload: PolicySearchRequest, provider: ProviderDep
) -> PolicySearchResponse:
    started = time.perf_counter()
    retriever = PolicyRetriever(settings, provider)
    chunks = await retriever.search(payload.query, payload.top_k)

    return PolicySearchResponse(
        results=[
            PolicySearchResult(
                score=chunk.score,
                section=chunk.section,
                content=chunk.content,
                document=PolicyDocumentRef(
                    slug=chunk.document_slug,
                    title=chunk.document_title,
                    payer=chunk.payer,
                ),
            )
            for chunk in chunks
        ],
        model=settings.ollama_embed_model,
        latency_ms=round((time.perf_counter() - started) * 1000),
    )
