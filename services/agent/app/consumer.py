"""RabbitMQ consumer that analyzes newly created orders.

Run from `services/agent` (separate process from the HTTP API):

    .venv/Scripts/python.exe -m app.consumer
"""

import asyncio
import logging

import aio_pika
from aio_pika import ExchangeType, IncomingMessage
from pydantic import ValidationError

from .bootstrap import build_runtime
from .config import Settings, get_settings
from .events import OrderCreatedEvent
from .workflow import AnalysisService

logger = logging.getLogger("agent.consumer")


async def handle_order_created(
    message: IncomingMessage, analysis: AnalysisService
) -> None:
    """Validate one event and run the workflow; reject to the DLQ on failure."""
    try:
        event = OrderCreatedEvent.model_validate_json(message.body)
    except ValidationError:
        logger.exception("rejecting malformed order.created event: %r", message.body[:500])
        await message.reject(requeue=False)
        return

    logger.info("analyzing order %s (event %s)", event.data.order_id, event.event_id)

    async with message.process(requeue=False):
        result = await analysis.analyze(event.data.order_id)
        logger.info(
            "order %s → %s (%s ms)",
            event.data.order_id,
            result.decision.outcome,
            result.latency_ms,
        )


async def run_consumer(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    runtime = build_runtime(settings)

    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    try:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1)

        exchange = await channel.declare_exchange(
            settings.rabbitmq_exchange, ExchangeType.TOPIC, durable=True
        )
        dead_letter_exchange = await channel.declare_exchange(
            settings.rabbitmq_dead_letter_exchange, ExchangeType.DIRECT, durable=True
        )

        dead_letter_key = f"{settings.rabbitmq_order_queue}.dlq"
        dead_letter_queue = await channel.declare_queue(
            dead_letter_key, durable=True
        )
        await dead_letter_queue.bind(dead_letter_exchange, routing_key=dead_letter_key)

        queue = await channel.declare_queue(
            settings.rabbitmq_order_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": settings.rabbitmq_dead_letter_exchange,
                "x-dead-letter-routing-key": dead_letter_key,
            },
        )
        await queue.bind(exchange, routing_key="order.created")

        await queue.consume(
            lambda message: handle_order_created(message, runtime.analysis)
        )

        logger.info(
            "consumer ready — exchange=%s queue=%s prefetch=1",
            settings.rabbitmq_exchange,
            settings.rabbitmq_order_queue,
        )
        await asyncio.Future()
    finally:
        await connection.close()
        await runtime.aclose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        asyncio.run(run_consumer())
    except KeyboardInterrupt:
        logger.info("consumer stopped")
