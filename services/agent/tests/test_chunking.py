from app.chunking import MAX_CHUNK_CHARS, chunk_markdown

SAMPLE = """# Synthetic Policy

Intro paragraph describing the policy scope, demo purpose, and the synthetic nature of this document.

## Coverage criteria

- AHI of at least 15 events per hour
- AHI 5 to 14 with a documented comorbidity
- A face-to-face evaluation

## Documentation requirements

1. Sleep study report
2. Physician order
"""


def test_chunks_follow_sections():
    chunks = chunk_markdown(SAMPLE)

    assert [chunk.section for chunk in chunks] == [
        None,
        "Coverage criteria",
        "Documentation requirements",
    ]
    assert "Intro paragraph" in chunks[0].content
    assert "AHI of at least 15" in chunks[1].content


def test_long_sections_are_split_with_overlap():
    long_paragraph = "criterion " * 400
    chunks = chunk_markdown(f"# Policy\n\n## Long section\n\n{long_paragraph}")

    long_chunks = [chunk for chunk in chunks if chunk.section == "Long section"]
    assert len(long_chunks) > 1
    assert all(len(chunk.content) <= MAX_CHUNK_CHARS for chunk in long_chunks)


def test_empty_sections_are_skipped():
    chunks = chunk_markdown("# Policy\n\n## Empty\n\n## Full\n\nSome content here.")

    assert [chunk.section for chunk in chunks] == ["Full"]
