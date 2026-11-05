import httpx
import pytest

from app.llm import ProviderError
from app.main import app

VALID_EXTRACTION = {
    "equipment": {"code": "E0601", "description": "CPAP device", "quantity": 1},
    "diagnosis": {"code": "G47.33", "description": "Obstructive sleep apnea"},
    "clinical_summary": "Severe OSA with failed PAP trial.",
    "supporting_evidence": ["AHI 32/hr"],
    "missing_information": [],
    "urgency": "routine",
    "confidence": 0.8,
}

EXTRACT_BODY = {
    "equipment_code": "E0601",
    "diagnosis_code": "G47.33",
    "quantity": 1,
    "clinical_notes": (
        "In-lab sleep study AHI 32/hr, ESS score 14. Prior 30-day PAP trial "
        "discontinued due to mask intolerance."
    ),
}


class FakeProvider:
    async def complete_json(self, *, system, user, schema):
        return VALID_EXTRACTION

    async def embed(self, texts):
        return [[0.01] * 768 for _ in texts]

    async def ping(self):
        return True


class FailingProvider(FakeProvider):
    async def complete_json(self, *, system, user, schema):
        raise ProviderError("boom")


@pytest.fixture(autouse=True)
def fake_provider():
    app.state.provider = FakeProvider()
    yield


async def request(method: str, path: str, json=None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, json=json)


async def test_health_reports_provider_status():
    response = await request("GET", "/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["ollama"] == "up"
    assert body["chat_model"] == "phi4-mini"


async def test_extract_returns_extraction():
    response = await request("POST", "/extract", json=EXTRACT_BODY)

    assert response.status_code == 200
    body = response.json()
    assert body["extraction"]["equipment"]["code"] == "E0601"
    assert body["model"] == "phi4-mini"
    assert isinstance(body["latency_ms"], int)


async def test_extract_validation_errors_are_problem_json():
    response = await request(
        "POST", "/extract", json={**EXTRACT_BODY, "clinical_notes": "short"}
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["title"] == "Validation failed"
    assert response.json()["errors"][0]["path"] == "clinical_notes"


async def test_provider_failure_maps_to_502_problem():
    app.state.provider = FailingProvider()

    response = await request("POST", "/extract", json=EXTRACT_BODY)

    assert response.status_code == 502
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["title"] == "LLM provider error"
