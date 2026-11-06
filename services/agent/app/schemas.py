from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ExtractionRequest(BaseModel):
    equipment_code: str = Field(
        min_length=5, max_length=5, description="HCPCS code, e.g. E0601"
    )
    diagnosis_code: str = Field(
        min_length=3, max_length=10, description="ICD-10 code, e.g. G47.33"
    )
    quantity: int = Field(default=1, ge=1, le=99)
    clinical_notes: str = Field(min_length=20, max_length=5000)


class EquipmentExtraction(BaseModel):
    code: str = Field(description="HCPCS code exactly as provided in the order")
    description: str = Field(description="Plain-language equipment description")
    quantity: int = Field(ge=1, le=99)


class DiagnosisExtraction(BaseModel):
    code: str = Field(description="ICD-10 code exactly as provided in the order")
    description: str = Field(description="Plain-language diagnosis description")


class ClinicalExtraction(BaseModel):
    """Structured facts extracted from the clinical notes."""

    equipment: EquipmentExtraction
    diagnosis: DiagnosisExtraction
    clinical_summary: str = Field(
        description="2-3 sentence summary of why this equipment is medically necessary"
    )
    supporting_evidence: list[str] = Field(
        description="Short direct facts from the notes that support approval"
    )
    missing_information: list[str] = Field(
        description="Documentation a payer would likely require that is not in the notes"
    )
    urgency: Literal["routine", "expedited", "unknown"] = Field(
        description="Expedited only when the notes describe a time-sensitive safety risk"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Certainty that the extraction is complete and correct"
    )


class ExtractionResponse(BaseModel):
    extraction: ClinicalExtraction
    model: str
    latency_ms: int


class DecisionRecommendation(BaseModel):
    """The agent's grounded prior-authorization recommendation."""

    outcome: Literal["APPROVE", "NEEDS_MORE_INFO", "DENY"]
    rationale: str = Field(
        description="How the documented facts satisfy or fail the cited coverage criteria"
    )
    policy_reference: str = Field(
        description="Exact citation label of the governing policy section, e.g. 'cpap › Coverage criteria'"
    )
    missing_documents: list[str] = Field(
        description="Specific documentation required before approval; empty for APPROVE"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Certainty in the recommendation (never exactly 1.0)"
    )


class PolicyCitation(BaseModel):
    document_slug: str
    document_title: str
    section: str | None
    score: float


class AnalysisResponse(BaseModel):
    order_id: str
    decision: DecisionRecommendation
    extraction: ClinicalExtraction
    citations: list[PolicyCitation]
    model: str
    latency_ms: int


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=32)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    embeddings: list[list[float]]


class PolicySearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=1000)
    top_k: int = Field(default=4, ge=1, le=10)


class PolicyDocumentRef(BaseModel):
    slug: str
    title: str
    payer: str


class PolicySearchResult(BaseModel):
    score: float
    section: str | None
    content: str
    document: PolicyDocumentRef


class PolicySearchResponse(BaseModel):
    results: list[PolicySearchResult]
    model: str
    latency_ms: int


class PolicyDocumentSummary(BaseModel):
    slug: str
    title: str
    payer: str
    effective_date: date
    source: str
    chunks: int
