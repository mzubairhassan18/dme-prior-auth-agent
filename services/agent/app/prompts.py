from .rag import RetrievedChunk

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


DECISION_SYSTEM_PROMPT = """You are a DME prior-authorization medical reviewer.
Decide exactly one outcome using ONLY the order context and the policy excerpts provided:

- APPROVE: every coverage criterion in the cited policy is satisfied by documented facts.
- NEEDS_MORE_INFO: required documentation is missing, but the order could qualify once it
  is supplied. List exactly what is missing.
- DENY: documented facts contradict or fail the coverage criteria, or an exclusion applies.

Rules:
- Cite one primary policy section using its exact bracketed label, for example
  "cpap › Coverage criteria". Never invent a citation.
- missing_documents must be specific and empty for APPROVE.
- confidence is between 0 and 1; never exactly 1.0.
- Do not invent clinical facts that are not in the order context.
- Return ONLY JSON matching the provided schema."""


def citation_label(chunk: RetrievedChunk) -> str:
    return f"{chunk.document_slug} › {chunk.section or 'Introduction'}"


def build_decision_prompt(
    *,
    equipment_code: str,
    diagnosis_code: str,
    quantity: int,
    insurance_provider: str,
    patient_name: str,
    clinical_summary: str,
    supporting_evidence: list[str],
    extraction_gaps: list[str],
    citations: list[RetrievedChunk],
) -> str:
    evidence = (
        "\n".join(f"- {item}" for item in supporting_evidence)
        or "- none documented"
    )
    gaps = "\n".join(f"- {item}" for item in extraction_gaps) or "- none identified"
    excerpts = "\n\n".join(
        f"[{citation_label(chunk)}]\n{chunk.content}" for chunk in citations
    )

    return f"""Order context:
- Equipment: {equipment_code} x{quantity}
- Diagnosis: {diagnosis_code}
- Patient: {patient_name} ({insurance_provider})

Extracted clinical facts:
{clinical_summary}

Supporting evidence:
{evidence}

Extraction-identified documentation gaps:
{gaps}

Policy excerpts:
{excerpts}
"""
