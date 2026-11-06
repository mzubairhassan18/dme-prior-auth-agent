-- CreateTable
CREATE TABLE "clinical_documents" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_documents_storage_key_key" ON "clinical_documents"("storage_key");

-- CreateIndex
CREATE INDEX "clinical_documents_order_id_idx" ON "clinical_documents"("order_id");

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "dme_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
