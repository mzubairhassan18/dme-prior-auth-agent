import pytest

from app.llm import ProviderError
from app.rag import RetrievedChunk
from app.repository import OrderContext, OrderNotFoundError
from app.workflow import AnalysisService, build_workflow

ORDER = OrderContext(
    id="14fff6f8-5e7d-47f8-98f4-338306ec737d",
    equipment_code="E0601",
    diagnosis_code="G47.33",
    quantity=1,
    clinical_notes=(
        "In-lab sleep study AHI 32/hr, ESS score 14. Prior 30-day PAP trial "
        "discontinued due to mask intolerance."
    ),
    status="SUBMITTED",
    patient_name="Sarah Mitchell",
    insurance_provider="Medicare Part B",
    member_id="M-1001",
)

CITATIONS = [
    RetrievedChunk(
        score=0.81,
        section="Coverage criteria",
        content="CPAP is covered when AHI >= 15 or AHI 5-14 with comorbidities.",
        document_slug="cpap",
        document_title="Medicare CPAP Coverage Criteria",
        payer="Medicare Part B",
    ),
    RetrievedChunk(
        score=0.75,
        section="Documentation requirements",
        content="The packet must include sleep study results and a physician order.",
        document_slug="cpap",
        document_title="Medicare CPAP Coverage Criteria",
        payer="Medicare Part B",
    ),
]

EXTRACTION_PAYLOAD = {
    "equipment": {"code": "E0601", "description": "CPAP device", "quantity": 1},
    "diagnosis": {"code": "G47.33", "description": "Obstructive sleep apnea"},
    "clinical_summary": "Severe OSA with a failed PAP trial.",
    "supporting_evidence": ["AHI 32/hr", "ESS 14"],
    "missing_information": [],
    "urgency": "routine",
    "confidence": 0.85,
}

DECISION_PAYLOAD = {
    "outcome": "APPROVE",
    "rationale": "AHI 32 satisfies the >= 15 threshold and the failed trial is documented.",
    "policy_reference": "cpap › Coverage criteria",
    "missing_documents": [],
    "confidence": 0.88,
}


class FakeProvider:
    def __init__(self, policy_reference: str = "cpap › Coverage criteria") -> None:
        self.policy_reference = policy_reference
        self.calls: list[str] = []

    async def complete_json(self, *, system, user, schema):
        title = schema.get("title", "")
        self.calls.append(title)
        if title == "ClinicalExtraction":
            return EXTRACTION_PAYLOAD
        return {**DECISION_PAYLOAD, "policy_reference": self.policy_reference}


class FailingProvider(FakeProvider):
    async def complete_json(self, *, system, user, schema):
        raise ProviderError("model unavailable")


class FakeRetriever:
    def __init__(self, citations=CITATIONS) -> None:
        self.citations = citations
        self.queries: list[str] = []

    async def search(self, query: str, top_k: int = 4):
        self.queries.append(query)
        return self.citations


class FakeRepository:
    def __init__(self, order: OrderContext = ORDER) -> None:
        self.order = order
        self.analyzing: list[str] = []
        self.saved: list[tuple[str, object, str]] = []
        self.failures: list[tuple[str, str]] = []

    async def fetch_order(self, order_id: str) -> OrderContext:
        if order_id != self.order.id:
            raise OrderNotFoundError(order_id)
        return self.order

    async def mark_analyzing(self, order_id: str) -> None:
        self.analyzing.append(order_id)

    async def save_decision(self, order_id, decision, model_used) -> None:
        self.saved.append((order_id, decision, model_used))

    async def mark_failed(self, order_id: str, reason: str) -> None:
        self.failures.append((order_id, reason))


def make_service(provider=None, retriever=None, repository=None):
    provider = provider or FakeProvider()
    retriever = retriever or FakeRetriever()
    repository = repository or FakeRepository()
    graph = build_workflow(provider, retriever, repository, model_name="phi4-mini")
    return AnalysisService(graph, repository), provider, retriever, repository


async def test_workflow_persists_cited_decision():
    service, provider, retriever, repository = make_service()

    result = await service.analyze(ORDER.id)

    assert result.decision.outcome == "APPROVE"
    assert result.citations == CITATIONS
    assert repository.analyzing == [ORDER.id]
    assert repository.failures == []
    assert len(repository.saved) == 1

    order_id, decision, model_used = repository.saved[0]
    assert order_id == ORDER.id
    assert decision.policy_reference == "cpap › Coverage criteria"
    assert decision.missing_documents == []
    assert model_used == "phi4-mini"

    assert provider.calls == ["ClinicalExtraction", "DecisionRecommendation"]
    assert "E0601" in retriever.queries[0]


async def test_unknown_citation_falls_back_to_top_chunk():
    service, _, _, repository = make_service(
        provider=FakeProvider(policy_reference="made-up › Imaginary section")
    )

    result = await service.analyze(ORDER.id)

    assert result.decision.policy_reference == "cpap › Coverage criteria"
    assert repository.saved[0][1].policy_reference == "cpap › Coverage criteria"


async def test_provider_failure_marks_order_failed():
    service, _, _, repository = make_service(provider=FailingProvider())

    with pytest.raises(ProviderError):
        await service.analyze(ORDER.id)

    assert repository.saved == []
    assert repository.failures[0][0] == ORDER.id
    assert "model unavailable" in repository.failures[0][1]


async def test_unknown_order_raises_not_found():
    service, _, _, _ = make_service()

    with pytest.raises(OrderNotFoundError):
        await service.analyze("00000000-0000-4000-8000-000000000000")
