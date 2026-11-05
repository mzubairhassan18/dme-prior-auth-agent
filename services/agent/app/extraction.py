from pydantic import ValidationError

from .llm import ChatProvider, ProviderError
from .prompts import EXTRACTION_SYSTEM_PROMPT, build_extraction_prompt
from .schemas import ClinicalExtraction, ExtractionRequest


async def extract_clinical_data(
    provider: ChatProvider, payload: ExtractionRequest
) -> ClinicalExtraction:
    """Ask the LLM for schema-constrained facts, then validate them with Pydantic."""
    raw = await provider.complete_json(
        system=EXTRACTION_SYSTEM_PROMPT,
        user=build_extraction_prompt(
            equipment_code=payload.equipment_code,
            diagnosis_code=payload.diagnosis_code,
            quantity=payload.quantity,
            clinical_notes=payload.clinical_notes,
        ),
        schema=ClinicalExtraction.model_json_schema(),
    )

    try:
        return ClinicalExtraction.model_validate(raw)
    except ValidationError as exc:
        raise ProviderError(
            f"Model output did not match the extraction schema "
            f"({exc.error_count()} issue(s))"
        ) from exc
