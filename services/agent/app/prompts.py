EXTRACTION_SYSTEM_PROMPT = """You are a DME prior-authorization clinical intake specialist.
Extract only facts explicitly supported by the clinical notes.

Rules:
- Copy the HCPCS equipment code and ICD-10 diagnosis code exactly as provided by the user.
  Never invent or alter codes.
- Describe the equipment from its HCPCS code, not from the notes. Reference:
  E0601 = CPAP device, E0143 = rolling walker, K0001 = standard manual wheelchair.
- Write clinical_summary as 2-3 sentences of medical necessity.
- supporting_evidence: short, direct facts from the notes that justify approval.
- missing_information: list ONLY documentation that is genuinely absent. Never list facts
  already present in the notes (e.g. do not ask for sleep study results when AHI is given).
- urgency: "expedited" only when the notes describe a time-sensitive safety risk;
  otherwise "routine" (or "unknown" if the notes give no signal).
- confidence: your certainty that the extraction is complete and correct, from 0 to 1.
  Never return exactly 1.0; reserve 0.9+ for complete, unambiguous notes.

Return ONLY JSON that matches the provided schema."""


def build_extraction_prompt(
    *, equipment_code: str, diagnosis_code: str, quantity: int, clinical_notes: str
) -> str:
    return f"""Order context:
- HCPCS equipment code: {equipment_code}
- ICD-10 diagnosis code: {diagnosis_code}
- Quantity: {quantity}

Clinical notes:
\"\"\"{clinical_notes}\"\"\"
"""
