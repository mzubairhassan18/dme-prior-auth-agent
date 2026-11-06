from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OrderCreatedData(BaseModel):
    """Fields the analysis worker needs from an order."""

    model_config = ConfigDict(populate_by_name=True)

    order_id: str = Field(alias="orderId", min_length=1)
    patient_id: str = Field(alias="patientId", min_length=1)
    equipment_code: str = Field(alias="equipmentCode", min_length=5, max_length=5)
    diagnosis_code: str = Field(alias="diagnosisCode", min_length=3, max_length=10)
    quantity: int = Field(ge=1, le=99)


class OrderCreatedEvent(BaseModel):
    """Mirror of packages/shared OrderCreatedEventSchema."""

    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId", min_length=1)
    event_type: Literal["order.created"] = Field(alias="eventType")
    occurred_at: datetime = Field(alias="occurredAt")
    data: OrderCreatedData
