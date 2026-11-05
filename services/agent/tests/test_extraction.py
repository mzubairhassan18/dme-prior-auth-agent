import pytest

from app.extraction import extract_clinical_data
from app.llm import ProviderError
from app.schemas import ExtractionRequest

VALID_EXTRACTION = {
    "equipment": {"code": "E0601", "description": "CPAP device", "quantity": 1},
    "diagnosis": {"code": "G47.33", "description": "Obstructive sleep apnea"},
    "clinical_summary": "Severe OSA with failed PAP trial and documented adherence.",
    "supporting_evidence": ["AHI 32/hr", "ESS 14", "90 days CPAP adherence"],
    "missing_information": [],
    "urgency": "routine",
    "confidence": 0.86,
}

REQUEST = ExtractionRequest(
    equipment_code="E0601",
    diagnosis_code="G47.33",
    quantity=1,
    clinical_notes=(
        "In-lab sleep study AHI 32/hr, ESS score 14. Prior 30-day PAP trial "
        "discontinued due to mask intolerance; new mask and humidifier requested."
    ),
)


class FakeProvider:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.calls: list[dict] = []

    async def complete_json(self, *, system, user, schema):
        self.calls.append({"system": system, "user": user, "schema": schema})
        return self.response


async def test_extract_returns_validated_extraction():
    provider = FakeProvider(VALID_EXTRACTION)

    result = await extract_clinical_data(provider, REQUEST)

    assert result.equipment.code == "E0601"
    assert result.urgency == "routine"
    assert result.confidence == 0.86


async def test_extract_sends_codes_and_schema_to_provider():
    provider = FakeProvider(VALID_EXTRACTION)

    await extract_clinical_data(provider, REQUEST)

    call = provider.calls[0]
    assert "E0601" in call["user"]
    assert "G47.33" in call["user"]
    assert "AHI 32/hr" in call["user"]
    assert call["schema"]["title"] == "ClinicalExtraction"


async def test_invalid_model_output_raises_provider_error():
    provider = FakeProvider({"equipment": {"code": "E0601"}})

    with pytest.raises(ProviderError, match="did not match"):
        await extract_clinical_data(provider, REQUEST)
