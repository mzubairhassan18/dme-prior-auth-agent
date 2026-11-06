import pytest
from pydantic import ValidationError

from app.events import OrderCreatedEvent

VALID_EVENT = {
    "eventId": "8f14e45f-ceea-4c6a-9c1f-5a7b3c9d2e10",
    "eventType": "order.created",
    "occurredAt": "2026-11-06T00:15:00.000Z",
    "data": {
        "orderId": "7fe071e5-3f42-4b5e-b2e5-eb3528a707e5",
        "patientId": "14fff6f8-5e7d-47f8-98f4-338306ec737d",
        "equipmentCode": "E0601",
        "diagnosisCode": "G47.33",
        "quantity": 1,
    },
}


def test_parses_order_created_event():
    event = OrderCreatedEvent.model_validate(VALID_EVENT)

    assert event.event_type == "order.created"
    assert event.data.order_id == "7fe071e5-3f42-4b5e-b2e5-eb3528a707e5"
    assert event.data.equipment_code == "E0601"


def test_rejects_wrong_event_type():
    with pytest.raises(ValidationError):
        OrderCreatedEvent.model_validate({**VALID_EVENT, "eventType": "order.updated"})


def test_rejects_missing_order_id():
    payload = {**VALID_EVENT, "data": {**VALID_EVENT["data"], "orderId": ""}}

    with pytest.raises(ValidationError):
        OrderCreatedEvent.model_validate(payload)
