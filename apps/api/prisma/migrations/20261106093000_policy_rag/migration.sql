-- pgvector for policy RAG (step 6). Handwritten because Prisma has no
-- native vector type; the schema models it as Unsupported("vector(768)").
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "policy_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "effective_date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "policy_documents_slug_key" ON "policy_documents"("slug");
CREATE UNIQUE INDEX "policy_chunks_document_id_chunk_index_key" ON "policy_chunks"("document_id", "chunk_index");
CREATE INDEX "policy_chunks_embedding_idx" ON "policy_chunks" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "policy_chunks"
    ADD CONSTRAINT "policy_chunks_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "policy_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
