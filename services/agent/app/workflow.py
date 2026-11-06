import logging
import time
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from .extraction import extract_clinical_data
from .llm import ChatProvider, ProviderError
from .prompts import (
    DECISION_SYSTEM_PROMPT,
    build_decision_prompt,
    citation_label,
)
from .publisher import EventPublisher
from .rag import PolicyRetriever, RetrievalError, RetrievedChunk
from .repository import (
    DecisionPayload,
    OrderContext,
    OrderRepository,
    RepositoryError,
)
from .schemas import (
    ClinicalExtraction,
    DecisionRecommendation,
    ExtractionRequest,
)

logger = logging.getLogger("agent.workflow")


class WorkflowError(RuntimeError):
    """Raised when the agent workflow cannot produce a valid decision."""


class WorkflowState(TypedDict, total=False):
    order: OrderContext
    extraction: ClinicalExtraction
    citations: list[RetrievedChunk]
    decision: DecisionRecommendation


def _citation_key(label: str) -> str:
    """Canonical form for comparing model output with retrieved labels."""
    return label.strip().strip("[]\"'`").strip().casefold()


def normalize_citation(
    decision: DecisionRecommendation, citations: list[RetrievedChunk]
) -> DecisionRecommendation:
    """Ground the citation: unknown references fall back to the top policy chunk."""
    labels = {_citation_key(citation_label(chunk)): citation_label(chunk) for chunk in citations}
    matched = labels.get(_citation_key(decision.policy_reference))
    if matched:
        if matched != decision.policy_reference:
            return decision.model_copy(update={"policy_reference": matched})
        return decision

    logger.warning(
        "model cited unknown policy reference %r — falling back to %r",
        decision.policy_reference,
        citation_label(citations[0]),
    )
    return decision.model_copy(
        update={"policy_reference": citation_label(citations[0])}
    )


def build_workflow(
    provider: ChatProvider,
    retriever: PolicyRetriever,
    repository: OrderRepository,
    model_name: str,
    publisher: EventPublisher | None = None,
):
    async def mark_analyzing(state: WorkflowState) -> dict[str, Any]:
        await repository.mark_analyzing(state["order"].id)
        if publisher is not None:
            await publisher.publish(
                "order.analyzing",
                {"orderId": state["order"].id, "status": "ANALYZING"},
            )
        return {}

    async def extract(state: WorkflowState) -> dict[str, Any]:
        order = state["order"]
        extraction = await extract_clinical_data(
            provider,
            ExtractionRequest(
                equipment_code=order.equipment_code,
                diagnosis_code=order.diagnosis_code,
                quantity=order.quantity,
                clinical_notes=order.clinical_notes,
            ),
        )
        return {"extraction": extraction}

    async def retrieve(state: WorkflowState) -> dict[str, Any]:
        order = state["order"]
        query = (
            f"{order.equipment_code} {order.diagnosis_code} "
            f"{order.clinical_notes[:800]}"
        )
        citations = await retriever.search(query, top_k=4)
        if not citations:
            raise WorkflowError(
                "No policy chunks found — run `python -m scripts.ingest_policies`"
            )
        return {"citations": citations}

    async def decide(state: WorkflowState) -> dict[str, Any]:
        order = state["order"]
        extraction = state["extraction"]
        citations = state["citations"]

        raw = await provider.complete_json(
            system=DECISION_SYSTEM_PROMPT,
            user=build_decision_prompt(
                equipment_code=order.equipment_code,
                diagnosis_code=order.diagnosis_code,
                quantity=order.quantity,
                insurance_provider=order.insurance_provider,
                patient_name=order.patient_name,
                clinical_summary=extraction.clinical_summary,
                supporting_evidence=extraction.supporting_evidence,
                extraction_gaps=extraction.missing_information,
                citations=citations,
            ),
            schema=DecisionRecommendation.model_json_schema(),
        )

        try:
            decision = DecisionRecommendation.model_validate(raw)
        except ValidationError as exc:
            raise WorkflowError(
                f"Decision output did not match schema ({exc.error_count()} issue(s))"
            ) from exc

        return {"decision": normalize_citation(decision, citations)}

    async def persist(state: WorkflowState) -> dict[str, Any]:
        decision = state["decision"]
        await repository.save_decision(
            state["order"].id,
            DecisionPayload(
                outcome=decision.outcome,
                rationale=decision.rationale,
                policy_reference=decision.policy_reference,
                missing_documents=decision.missing_documents,
                confidence=decision.confidence,
            ),
            model_used=model_name,
        )
        return {}

    graph = StateGraph(WorkflowState)
    graph.add_node("mark_analyzing", mark_analyzing)
    graph.add_node("extract", extract)
    graph.add_node("retrieve", retrieve)
    graph.add_node("decide", decide)
    graph.add_node("persist", persist)

    graph.add_edge(START, "mark_analyzing")
    graph.add_edge("mark_analyzing", "extract")
    graph.add_edge("extract", "retrieve")
    graph.add_edge("retrieve", "decide")
    graph.add_edge("decide", "persist")
    graph.add_edge("persist", END)

    return graph.compile()


class AnalysisResult:
    def __init__(
        self,
        *,
        extraction: ClinicalExtraction,
        decision: DecisionRecommendation,
        citations: list[RetrievedChunk],
        latency_ms: int,
    ) -> None:
        self.extraction = extraction
        self.decision = decision
        self.citations = citations
        self.latency_ms = latency_ms


class AnalysisService:
    def __init__(
        self,
        graph,
        repository: OrderRepository,
        publisher: EventPublisher | None = None,
    ) -> None:
        self._graph = graph
        self._repository = repository
        self._publisher = publisher

    async def analyze(self, order_id: str) -> AnalysisResult:
        order = await self._repository.fetch_order(order_id)
        started = time.perf_counter()

        try:
            final_state: WorkflowState = await self._graph.ainvoke({"order": order})
        except Exception as exc:
            try:
                await self._repository.mark_failed(order_id, str(exc))
            except RepositoryError:
                logger.exception("could not mark order %s as FAILED", order_id)

            if self._publisher is not None:
                await self._publisher.publish(
                    "order.failed",
                    {
                        "orderId": order_id,
                        "status": "FAILED",
                        "error": str(exc)[:500],
                    },
                )

            if isinstance(exc, (ProviderError, WorkflowError, RetrievalError)):
                raise
            if isinstance(exc, RepositoryError):
                raise
            raise WorkflowError(f"Agent workflow failed: {exc}") from exc

        decision = final_state["decision"]
        if self._publisher is not None:
            await self._publisher.publish(
                "order.analyzed",
                {
                    "orderId": order_id,
                    "status": "DECISION_READY",
                    "outcome": decision.outcome,
                    "policyReference": decision.policy_reference,
                    "confidence": decision.confidence,
                },
            )

        return AnalysisResult(
            extraction=final_state["extraction"],
            decision=decision,
            citations=final_state["citations"],
            latency_ms=round((time.perf_counter() - started) * 1000),
        )
