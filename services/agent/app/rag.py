import asyncio
from dataclasses import dataclass
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import Settings
from .llm import ChatProvider


class RetrievalError(RuntimeError):
    """Raised when the policy index cannot be queried."""


@dataclass(frozen=True)
class RetrievedChunk:
    score: float
    section: str | None
    content: str
    document_slug: str
    document_title: str
    payer: str


@dataclass(frozen=True)
class PolicyDocumentRow:
    slug: str
    title: str
    payer: str
    effective_date: date
    source: str
    chunks: int


def vector_literal(values: list[float]) -> str:
    """pgvector text representation, e.g. [0.1,0.2,...]."""
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def _fetch_all(
    database_url: str, sql: str, params: tuple[Any, ...] = ()
) -> list[dict[str, Any]]:
    # Sync psycopg runs in a worker thread: psycopg's async connections reject
    # Windows' ProactorEventLoop, and this keeps one portable code path.
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()


class PolicyRetriever:
    def __init__(self, settings: Settings, provider: ChatProvider) -> None:
        self._settings = settings
        self._provider = provider

    async def search(self, query: str, top_k: int = 4) -> list[RetrievedChunk]:
        embeddings = await self._provider.embed([query])
        literal = vector_literal(embeddings[0])

        sql = """
            SELECT 1 - (c.embedding <=> %s::vector) AS score,
                   c.section,
                   c.content,
                   d.slug AS document_slug,
                   d.title AS document_title,
                   d.payer
            FROM policy_chunks c
            JOIN policy_documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
        """

        try:
            rows = await asyncio.to_thread(
                _fetch_all,
                self._settings.database_url,
                sql,
                (literal, literal, top_k),
            )
        except psycopg.Error as exc:
            raise RetrievalError(f"Policy index query failed: {exc}") from exc

        return [
            RetrievedChunk(
                score=float(row["score"]),
                section=row["section"],
                content=row["content"],
                document_slug=row["document_slug"],
                document_title=row["document_title"],
                payer=row["payer"],
            )
            for row in rows
        ]


async def list_policy_documents(settings: Settings) -> list[PolicyDocumentRow]:
    sql = """
        SELECT d.slug, d.title, d.payer, d.effective_date, d.source,
               count(c.id)::int AS chunks
        FROM policy_documents d
        LEFT JOIN policy_chunks c ON c.document_id = d.id
        GROUP BY d.id
        ORDER BY d.slug
    """

    try:
        rows = await asyncio.to_thread(_fetch_all, settings.database_url, sql)
    except psycopg.Error as exc:
        raise RetrievalError(f"Policy index query failed: {exc}") from exc

    return [PolicyDocumentRow(**row) for row in rows]
