"""Publishes agent lifecycle events to RabbitMQ.

Events are best effort: a broker outage must never fail an analysis.
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import aio_pika
from aio_pika import DeliveryMode, ExchangeType, Message

from .config import Settings

logger = logging.getLogger("agent.publisher")


class EventPublisher:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._lock = asyncio.Lock()

    async def _get_connection(self) -> aio_pika.abc.AbstractRobustConnection:
        if self._connection is not None and not self._connection.is_closed:
            return self._connection

        async with self._lock:
            if self._connection is None or self._connection.is_closed:
                self._connection = await aio_pika.connect_robust(
                    self._settings.rabbitmq_url
                )
                logger.info("publisher connected to RabbitMQ")

        return self._connection

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        event_id = str(uuid.uuid4())
        envelope = {
            "eventId": event_id,
            "eventType": event_type,
            "occurredAt": datetime.now(UTC).isoformat(),
            "data": data,
        }

        try:
            connection = await self._get_connection()
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                self._settings.rabbitmq_exchange, ExchangeType.TOPIC, durable=True
            )
            await exchange.publish(
                Message(
                    body=json.dumps(envelope).encode("utf-8"),
                    content_type="application/json",
                    message_id=event_id,
                    delivery_mode=DeliveryMode.PERSISTENT,
                ),
                routing_key=event_type,
            )
            await channel.close()
            logger.info("published %s (%s)", event_type, event_id)
        except Exception:  # noqa: BLE001 — never fail an analysis on publish
            logger.exception("could not publish %s event", event_type)
            self._connection = None

    async def aclose(self) -> None:
        if self._connection is not None and not self._connection.is_closed:
            await self._connection.close()
        self._connection = None
