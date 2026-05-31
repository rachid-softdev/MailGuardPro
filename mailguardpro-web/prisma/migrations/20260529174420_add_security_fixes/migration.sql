-- AlterTable
ALTER TABLE "Validation" ADD COLUMN     "emailHash" VARCHAR(64);

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "privacyMode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");

-- CreateIndex
CREATE INDEX "Validation_emailHash_idx" ON "Validation"("emailHash");
