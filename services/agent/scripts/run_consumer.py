"""CLI entry point for the order.created consumer.

Run from `services/agent`:

    .venv/Scripts/python.exe -m scripts.run_consumer
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.consumer import run_consumer

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        asyncio.run(run_consumer())
    except KeyboardInterrupt:
        logging.getLogger("agent.consumer").info("consumer stopped")
