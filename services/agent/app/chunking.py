import re
from dataclasses import dataclass

MAX_CHUNK_CHARS = 1200
OVERLAP_CHARS = 120


@dataclass(frozen=True)
class PolicyChunkData:
    section: str | None
    content: str


def _split_long_block(block: str) -> list[str]:
    """Slice an oversized paragraph into overlapping windows."""
    if len(block) <= MAX_CHUNK_CHARS:
        return [block]

    pieces: list[str] = []
    start = 0
    while start < len(block):
        end = min(start + MAX_CHUNK_CHARS, len(block))
        pieces.append(block[start:end])
        if end == len(block):
            break
        start = end - OVERLAP_CHARS
    return pieces


def chunk_markdown(markdown: str) -> list[PolicyChunkData]:
    """Split a policy document on `##` headings, then pack paragraphs.

    The section heading travels with every chunk so retrieval results can cite
    the exact policy section.
    """
    sections = re.split(r"(?m)^##\s+", markdown)
    chunks: list[PolicyChunkData] = []

    preamble = re.sub(r"(?m)^#\s+.*$", "", sections[0]).strip()
    if len(preamble) >= 80:
        chunks.append(PolicyChunkData(section=None, content=preamble))

    for raw_section in sections[1:]:
        lines = raw_section.splitlines()
        if not lines:
            continue

        heading = lines[0].strip()
        body = "\n".join(lines[1:]).strip()
        if not body:
            continue

        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        buffer = ""
        for paragraph in paragraphs:
            candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
            if len(candidate) <= MAX_CHUNK_CHARS:
                buffer = candidate
                continue

            if buffer:
                chunks.append(PolicyChunkData(section=heading, content=buffer))
                buffer = ""

            for piece in _split_long_block(paragraph):
                chunks.append(PolicyChunkData(section=heading, content=piece))

        if buffer:
            chunks.append(PolicyChunkData(section=heading, content=buffer))

    return chunks
