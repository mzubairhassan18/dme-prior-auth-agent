from app.rag import vector_literal


def test_vector_literal_formats_for_pgvector():
    literal = vector_literal([0.5, -1.25, 0.0])

    assert literal == "[0.50000000,-1.25000000,0.00000000]"
    assert literal.startswith("[") and literal.endswith("]")
