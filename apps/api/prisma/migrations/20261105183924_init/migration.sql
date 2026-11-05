-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'ANALYZING', 'DECISION_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVE', 'NEEDS_MORE_INFO', 'DENY');

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "insurance_provider" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dme_orders" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "equipment_code" TEXT NOT NULL,
    "diagnosis_code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "clinical_notes" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dme_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_decisions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "rationale" TEXT NOT NULL,
    "policy_reference" TEXT NOT NULL,
    "missing_documents" TEXT[],
    "confidence" DOUBLE PRECISION,
    "model_used" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authorization_decisions_order_id_key" ON "authorization_decisions"("order_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "dme_orders" ADD CONSTRAINT "dme_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_decisions" ADD CONSTRAINT "authorization_decisions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "dme_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
