import asyncio
import uuid
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import Settings


class OrderNotFoundError(LookupError):
    """Raised when the requested DME order does not exist."""


class RepositoryError(RuntimeError):
    """Raised when persistence fails."""


@dataclass(frozen=True)
class OrderContext:
    id: str
    equipment_code: str
    diagnosis_code: str
    quantity: int
    clinical_notes: str
    status: str
    patient_name: str
    insurance_provider: str
    member_id: str


@dataclass(frozen=True)
class DecisionPayload:
    outcome: str
    rationale: str
    policy_reference: str
    missing_documents: list[str]
    confidence: float


def _fetch_order(database_url: str, order_id: str) -> dict[str, Any] | None:
    sql = """
        SELECT o.id, o.equipment_code, o.diagnosis_code, o.quantity, o.clinical_notes,
               o.status, p.first_name, p.last_name, p.insurance_provider, p.member_id
        FROM dme_orders o
        JOIN patients p ON p.id = o.patient_id
        WHERE o.id = %s
    """
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, (order_id,))
            return cursor.fetchone()


def _mark_analyzing(database_url: str, order_id: str) -> None:
    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE dme_orders
                    SET status = 'ANALYZING', updated_at = now()
                    WHERE id = %s
                    """,
                    (order_id,),
                )
                cursor.execute(
                    """
                    INSERT INTO audit_logs
                        (id, entity_type, entity_id, action, actor, detail)
                    VALUES (%s, 'dme_order', %s, 'analysis_started', 'agent', %s)
                    """,
                    (str(uuid.uuid4()), order_id, Jsonb({"workflow": "prior_auth_v1"})),
                )


def _save_decision(
    database_url: str, order_id: str, decision: DecisionPayload, model_used: str
) -> None:
    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO authorization_decisions
                        (id, order_id, outcome, rationale, policy_reference,
                         missing_documents, confidence, model_used)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        outcome = EXCLUDED.outcome,
                        rationale = EXCLUDED.rationale,
                        policy_reference = EXCLUDED.policy_reference,
                        missing_documents = EXCLUDED.missing_documents,
                        confidence = EXCLUDED.confidence,
                        model_used = EXCLUDED.model_used,
                        created_at = now()
                    RETURNING id
                    """,
                    (
                        str(uuid.uuid4()),
                        order_id,
                        decision.outcome,
                        decision.rationale,
                        decision.policy_reference,
                        decision.missing_documents,
                        decision.confidence,
                        model_used,
                    ),
                )
                decision_id = str(cursor.fetchone()[0])

                cursor.execute(
                    """
                    UPDATE dme_orders
                    SET status = 'DECISION_READY', updated_at = now()
                    WHERE id = %s
                    """,
                    (order_id,),
                )
                cursor.execute(
                    """
                    INSERT INTO audit_logs
                        (id, entity_type, entity_id, action, actor, detail)
                    VALUES (%s, 'dme_order', %s, 'decision_recorded', 'agent', %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        order_id,
                        Jsonb(
                            {
                                "decisionId": decision_id,
                                "outcome": decision.outcome,
                                "policyReference": decision.policy_reference,
                                "confidence": decision.confidence,
                            }
                        ),
                    ),
                )


def _mark_failed(database_url: str, order_id: str, reason: str) -> None:
    with psycopg.connect(database_url) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE dme_orders
                    SET status = 'FAILED', updated_at = now()
                    WHERE id = %s
                    """,
                    (order_id,),
                )
                cursor.execute(
                    """
                    INSERT INTO audit_logs
                        (id, entity_type, entity_id, action, actor, detail)
                    VALUES (%s, 'dme_order', %s, 'analysis_failed', 'agent', %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        order_id,
                        Jsonb({"error": reason[:1000]}),
                    ),
                )


class OrderRepository:
    """Persistence for the workflow — sync psycopg executed off the event loop."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def fetch_order(self, order_id: str) -> OrderContext:
        try:
            row = await asyncio.to_thread(
                _fetch_order, self._settings.database_url, order_id
            )
        except psycopg.Error as exc:
            raise RepositoryError(f"Failed to load order: {exc}") from exc

        if row is None:
            raise OrderNotFoundError(order_id)

        return OrderContext(
            id=str(row["id"]),
            equipment_code=row["equipment_code"],
            diagnosis_code=row["diagnosis_code"],
            quantity=row["quantity"],
            clinical_notes=row["clinical_notes"],
            status=row["status"],
            patient_name=f"{row['first_name']} {row['last_name']}",
            insurance_provider=row["insurance_provider"],
            member_id=row["member_id"],
        )

    async def mark_analyzing(self, order_id: str) -> None:
        try:
            await asyncio.to_thread(
                _mark_analyzing, self._settings.database_url, order_id
            )
        except psycopg.Error as exc:
            raise RepositoryError(f"Failed to mark order analyzing: {exc}") from exc

    async def save_decision(
        self, order_id: str, decision: DecisionPayload, model_used: str
    ) -> None:
        try:
            await asyncio.to_thread(
                _save_decision,
                self._settings.database_url,
                order_id,
                decision,
                model_used,
            )
        except psycopg.Error as exc:
            raise RepositoryError(f"Failed to save decision: {exc}") from exc

    async def mark_failed(self, order_id: str, reason: str) -> None:
        try:
            await asyncio.to_thread(
                _mark_failed, self._settings.database_url, order_id, reason
            )
        except psycopg.Error as exc:
            raise RepositoryError(f"Failed to mark order failed: {exc}") from exc
