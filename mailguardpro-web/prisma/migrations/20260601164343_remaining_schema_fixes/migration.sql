-- AlterTable: Add pinnedIps to Webhook (was missing from prior migrations)
ALTER TABLE "Webhook" ADD COLUMN "pinnedIps" JSONB;
