"""Embed the policy corpus into pgvector.

Run from `services/agent`:

    .venv/Scripts/python.exe -m scripts.ingest_policies
"""

import asyncio
import sys
from pathlib import Path
from typing import Any

import psycopg
import yaml
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.chunking import chunk_markdown
from app.config import get_settings
from app.llm import OllamaProvider
from app.rag import vector_literal

POLICIES_DIR = Path(__file__).resolve().parent.parent / "policies"
BATCH_SIZE = 16


def parse_policy(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError(f"{path.name}: expected YAML front matter")

    _, front_matter, body = text.split("---", 2)
    metadata = yaml.safe_load(front_matter) or {}
    for required in ("title", "payer", "effective", "source"):
        if required not in metadata:
            raise ValueError(f"{path.name}: missing '{required}' in front matter")
    return metadata, body


async def ingest() -> None:
    settings = get_settings()
    provider = OllamaProvider(settings)
    files = sorted(POLICIES_DIR.glob("*.md"))
    if not files:
        raise SystemExit(f"No policy documents found in {POLICIES_DIR}")

    total_chunks = 0
    try:
        async with await psycopg.AsyncConnection.connect(
            settings.database_url
        ) as connection:
            for path in files:
                metadata, body = parse_policy(path)
                chunks = chunk_markdown(body)

                embeddings: list[list[float]] = []
                for start in range(0, len(chunks), BATCH_SIZE):
                    batch = chunks[start : start + BATCH_SIZE]
                    embeddings.extend(
                        await provider.embed([chunk.content for chunk in batch])
                    )

                async with connection.transaction():
                    async with connection.cursor(row_factory=dict_row) as cursor:
                        await cursor.execute(
                            """
                            INSERT INTO policy_documents
                                (slug, title, payer, effective_date, source)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (slug) DO UPDATE SET
                                title = EXCLUDED.title,
                                payer = EXCLUDED.payer,
                                effective_date = EXCLUDED.effective_date,
                                source = EXCLUDED.source
                            RETURNING id
                            """,
                            (
                                path.stem,
                                metadata["title"],
                                metadata["payer"],
                                metadata["effective"],
                                metadata["source"],
                            ),
                        )
                        document_id = (await cursor.fetchone())["id"]

                        await cursor.execute(
                            "DELETE FROM policy_chunks WHERE document_id = %s",
                            (document_id,),
                        )
                        await cursor.executemany(
                            """
                            INSERT INTO policy_chunks
                                (document_id, chunk_index, section, content, embedding)
                            VALUES (%s, %s, %s, %s, %s::vector)
                            """,
                            [
                                (
                                    document_id,
                                    index,
                                    chunk.section,
                                    chunk.content,
                                    vector_literal(embedding),
                                )
                                for index, (chunk, embedding) in enumerate(
                                    zip(chunks, embeddings)
                                )
                            ],
                        )

                total_chunks += len(chunks)
                print(f"  {path.stem}: {len(chunks)} chunks")

        print(f"ingested {len(files)} documents, {total_chunks} chunks")
    finally:
        await provider.aclose()


if __name__ == "__main__":
    if sys.platform == "win32":
        # psycopg async connections cannot run on the ProactorEventLoop (Windows default).
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(ingest())
