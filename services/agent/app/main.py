import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .extraction import extract_clinical_data
from .llm import ChatProvider, OllamaProvider, ProviderError
from .rag import PolicyRetriever, RetrievalError, list_policy_documents
from .repository import OrderNotFoundError, OrderRepository, RepositoryError
from .schemas import (
    AnalysisResponse,
    EmbedRequest,
    EmbedResponse,
    ExtractionRequest,
    ExtractionResponse,
    PolicyCitation,
    PolicyDocumentRef,
    PolicyDocumentSummary,
    PolicySearchRequest,
    PolicySearchResponse,
    PolicySearchResult,
)
from .workflow import AnalysisService, WorkflowError, build_workflow

logger = logging.getLogger("agent")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = OllamaProvider(settings)
    retriever = PolicyRetriever(settings, provider)
    repository = OrderRepository(settings)
    graph = build_workflow(
        provider,
        retriever,
        repository,
        model_name=settings.ollama_chat_model,
    )

    app.state.provider = provider
    app.state.analysis = AnalysisService(graph, repository)

    logger.info(
        "agent started — chat=%s embed=%s",
        settings.ollama_chat_model,
        settings.ollama_embed_model,
    )
    yield
    await provider.aclose()


app = FastAPI(
    title="DME Prior Auth Agent",
    version="0.1.0",
    description="Local LLM service for DME prior-authorization workflows",
    lifespan=lifespan,
)


def get_provider(request: Request) -> ChatProvider:
    return request.app.state.provider


def get_analysis(request: Request) -> AnalysisService:
    return request.app.state.analysis


ProviderDep = Annotated[ChatProvider, Depends(get_provider)]
AnalysisDep = Annotated[AnalysisService, Depends(get_analysis)]


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


@app.exception_handler(OrderNotFoundError)
async def order_not_found_handler(
    request: Request, exc: OrderNotFoundError
) -> JSONResponse:
    return problem(
        status=404,
        title="Order not found",
        detail=f"No DME order with id {exc.args[0] if exc.args else 'unknown'}",
        instance=request.url.path,
    )


@app.exception_handler(WorkflowError)
async def workflow_exception_handler(
    request: Request, exc: WorkflowError
) -> JSONResponse:
    logger.warning("workflow error: %s", exc)
    return problem(
        status=502,
        title="Agent workflow error",
        detail=str(exc),
        instance=request.url.path,
    )


@app.exception_handler(RepositoryError)
async def repository_exception_handler(
    request: Request, exc: RepositoryError
) -> JSONResponse:
    logger.error("repository error: %s", exc)
    return problem(
        status=503,
        title="Database unavailable",
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


@app.post("/orders/{order_id}/analyze", response_model=AnalysisResponse)
async def analyze_order(
    order_id: str, analysis: AnalysisDep
) -> AnalysisResponse:
    try:
        normalized_id = str(uuid.UUID(order_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Order not found") from None

    result = await analysis.analyze(normalized_id)

    return AnalysisResponse(
        order_id=normalized_id,
        decision=result.decision,
        extraction=result.extraction,
        citations=[
            PolicyCitation(
                document_slug=chunk.document_slug,
                document_title=chunk.document_title,
                section=chunk.section,
                score=chunk.score,
            )
            for chunk in result.citations
        ],
        model=settings.ollama_chat_model,
        latency_ms=result.latency_ms,
    )
