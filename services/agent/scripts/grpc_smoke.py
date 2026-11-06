"""Smoke-test the gRPC analysis endpoint for an existing order.

Run from `services/agent`:

    .venv/Scripts/python.exe -m scripts.grpc_smoke <order-id>
"""

import asyncio
import sys
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.grpc_generated import agent_pb2, agent_pb2_grpc


async def main(order_id: str) -> None:
    settings = get_settings()
    async with grpc.aio.insecure_channel(
        f"localhost:{settings.grpc_port}"
    ) as channel:
        stub = agent_pb2_grpc.PriorAuthAgentStub(channel)
        response = await stub.AnalyzeOrder(
            agent_pb2.AnalyzeOrderRequest(order_id=order_id), timeout=180
        )

    print(f"order        : {response.order_id}")
    print(f"outcome      : {response.outcome}")
    print(f"policy       : {response.policy_reference}")
    print(f"confidence   : {response.confidence}")
    print(f"missing docs : {list(response.missing_documents)}")
    print(f"citations    : {[c.section for c in response.citations]}")
    print(f"latency      : {response.latency_ms} ms")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m scripts.grpc_smoke <order-id>")
    asyncio.run(main(sys.argv[1]))
