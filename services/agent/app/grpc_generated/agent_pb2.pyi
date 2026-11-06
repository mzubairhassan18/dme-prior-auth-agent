from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AnalyzeOrderRequest(_message.Message):
    __slots__ = ("order_id",)
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    def __init__(self, order_id: _Optional[str] = ...) -> None: ...

class PolicyCitation(_message.Message):
    __slots__ = ("document_slug", "document_title", "section", "score")
    DOCUMENT_SLUG_FIELD_NUMBER: _ClassVar[int]
    DOCUMENT_TITLE_FIELD_NUMBER: _ClassVar[int]
    SECTION_FIELD_NUMBER: _ClassVar[int]
    SCORE_FIELD_NUMBER: _ClassVar[int]
    document_slug: str
    document_title: str
    section: str
    score: float
    def __init__(self, document_slug: _Optional[str] = ..., document_title: _Optional[str] = ..., section: _Optional[str] = ..., score: _Optional[float] = ...) -> None: ...

class Equipment(_message.Message):
    __slots__ = ("code", "description", "quantity")
    CODE_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    code: str
    description: str
    quantity: int
    def __init__(self, code: _Optional[str] = ..., description: _Optional[str] = ..., quantity: _Optional[int] = ...) -> None: ...

class Diagnosis(_message.Message):
    __slots__ = ("code", "description")
    CODE_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    code: str
    description: str
    def __init__(self, code: _Optional[str] = ..., description: _Optional[str] = ...) -> None: ...

class ClinicalExtraction(_message.Message):
    __slots__ = ("equipment", "diagnosis", "clinical_summary", "supporting_evidence", "missing_information", "urgency", "confidence")
    EQUIPMENT_FIELD_NUMBER: _ClassVar[int]
    DIAGNOSIS_FIELD_NUMBER: _ClassVar[int]
    CLINICAL_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    SUPPORTING_EVIDENCE_FIELD_NUMBER: _ClassVar[int]
    MISSING_INFORMATION_FIELD_NUMBER: _ClassVar[int]
    URGENCY_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    equipment: Equipment
    diagnosis: Diagnosis
    clinical_summary: str
    supporting_evidence: _containers.RepeatedScalarFieldContainer[str]
    missing_information: _containers.RepeatedScalarFieldContainer[str]
    urgency: str
    confidence: float
    def __init__(self, equipment: _Optional[_Union[Equipment, _Mapping]] = ..., diagnosis: _Optional[_Union[Diagnosis, _Mapping]] = ..., clinical_summary: _Optional[str] = ..., supporting_evidence: _Optional[_Iterable[str]] = ..., missing_information: _Optional[_Iterable[str]] = ..., urgency: _Optional[str] = ..., confidence: _Optional[float] = ...) -> None: ...

class AnalyzeOrderResponse(_message.Message):
    __slots__ = ("order_id", "outcome", "rationale", "policy_reference", "missing_documents", "confidence", "citations", "extraction", "model", "latency_ms")
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_FIELD_NUMBER: _ClassVar[int]
    RATIONALE_FIELD_NUMBER: _ClassVar[int]
    POLICY_REFERENCE_FIELD_NUMBER: _ClassVar[int]
    MISSING_DOCUMENTS_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    CITATIONS_FIELD_NUMBER: _ClassVar[int]
    EXTRACTION_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    LATENCY_MS_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    outcome: str
    rationale: str
    policy_reference: str
    missing_documents: _containers.RepeatedScalarFieldContainer[str]
    confidence: float
    citations: _containers.RepeatedCompositeFieldContainer[PolicyCitation]
    extraction: ClinicalExtraction
    model: str
    latency_ms: int
    def __init__(self, order_id: _Optional[str] = ..., outcome: _Optional[str] = ..., rationale: _Optional[str] = ..., policy_reference: _Optional[str] = ..., missing_documents: _Optional[_Iterable[str]] = ..., confidence: _Optional[float] = ..., citations: _Optional[_Iterable[_Union[PolicyCitation, _Mapping]]] = ..., extraction: _Optional[_Union[ClinicalExtraction, _Mapping]] = ..., model: _Optional[str] = ..., latency_ms: _Optional[int] = ...) -> None: ...
