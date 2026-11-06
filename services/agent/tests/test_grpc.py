import pytest

from app.grpc_server import to_proto_response
from app.rag import RetrievedChunk
from app.schemas import ClinicalExtraction, DecisionRecommendation
from app.workflow import AnalysisResult


def make_result() -> AnalysisResult:
    extraction = ClinicalExtraction.model_validate(
        {
            "equipment": {
                "code": "E0601",
                "description": "CPAP device",
                "quantity": 1,
            },
            "diagnosis": {
                "code": "G47.33",
                "description": "Obstructive sleep apnea",
            },
            "clinical_summary": "Severe OSA with documented PAP failure.",
            "supporting_evidence": ["AHI 32/hr", "ESS 14"],
            "missing_information": [],
            "urgency": "routine",
            "confidence": 0.9,
        }
    )
    decision = DecisionRecommendation.model_validate(
        {
            "outcome": "APPROVE",
            "rationale": "AHI 32 meets the coverage threshold.",
            "policy_reference": "cpap › Coverage criteria",
            "missing_documents": [],
            "confidence": 0.88,
        }
    )
    citations = [
        RetrievedChunk(
            score=0.81,
            section="Coverage criteria",
            content="CPAP is covered when AHI >= 15.",
            document_slug="cpap",
            document_title="Medicare CPAP Coverage Criteria",
            payer="Medicare Part B",
        )
    ]
    return AnalysisResult(
        extraction=extraction,
        decision=decision,
        citations=citations,
        latency_ms=1234,
    )


def test_maps_decision_and_extraction_to_proto():
    response = to_proto_response("7fe071e5-3f42-4b5e-b2e5-eb3528a707e5", make_result(), "phi4-mini")

    assert response.order_id == "7fe071e5-3f42-4b5e-b2e5-eb3528a707e5"
    assert response.outcome == "APPROVE"
    assert response.policy_reference == "cpap › Coverage criteria"
    assert response.confidence == pytest.approx(0.88)
    assert response.citations[0].section == "Coverage criteria"
    assert response.extraction.equipment.code == "E0601"
    assert response.extraction.diagnosis.code == "G47.33"
    assert list(response.extraction.supporting_evidence) == ["AHI 32/hr", "ESS 14"]
    assert response.model == "phi4-mini"
    assert response.latency_ms == 1234
