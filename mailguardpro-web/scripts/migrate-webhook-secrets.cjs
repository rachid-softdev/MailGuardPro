/**
 * Script de migration des secrets webhook
 * 
 * À exécuter AVANT de déployer la modification de schéma (rename secret → encryptedSecret).
 * 
 * Usage:
 *   1. Backup the database first
 *   2. Add the encryptedSecret column to the Webhook table (nullable):
 *      ALTER TABLE "Webhook" ADD COLUMN "encryptedSecret" TEXT;
 *   3. Run this script:
 *      node scripts/migrate-webhook-secrets.cjs
 *   4. Verify all records have encryptedSecret populated
 *   5. Deploy the schema rename (drop secret column)
 *   6. Deploy the new code
 * 
 * Prérequis:
 *   - TOKEN_ENCRYPTION_KEY définie dans l'environnement
 *   - DATABASE_URL configurée
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");

// Copied from lib/crypto.ts — keep in sync
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!TOKEN_ENCRYPTION_KEY || Buffer.from(TOKEN_ENCRYPTION_KEY, "hex").length !== 32) {
  console.error(
    "ERROR: TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).\n" +
    "Generate with: openssl rand -hex 32"
  );
  process.exit(1);
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(TOKEN_ENCRYPTION_KEY, "hex"),
    iv
  );
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

async function main() {
  console.log("=== Webhook Secret Migration Script ===\n");
  console.log(`TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY.substring(0, 8)}... (${TOKEN_ENCRYPTION_KEY.length} chars)`);
  console.log(`Algorithm: ${ALGORITHM}\n`);

  const prisma = new PrismaClient();

  try {
    // Step 1: Check if the old `secret` column exists
    const columns = await prisma.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Webhook' AND column_name IN ('secret', 'encryptedSecret')"
    );
    const columnNames = columns.map((c) => c.column_name);
    console.log("Existing columns:", columnNames);

    if (!columnNames.includes("secret")) {
      console.log("No 'secret' column found — nothing to migrate.");
      console.log("If migration is already complete, this is expected. ✓");
      return;
    }

    if (!columnNames.includes("encryptedSecret")) {
      console.error(
        "ERROR: 'encryptedSecret' column does not exist.\n" +
        "Run first: ALTER TABLE \"Webhook\" ADD COLUMN \"encryptedSecret\" TEXT;"
      );
      process.exit(1);
    }

    // Step 2: Count webhooks that need migration
    const toMigrate = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "Webhook" WHERE "secret" IS NOT NULL AND "encryptedSecret" IS NULL`
    );
    const count = Number(toMigrate[0].count);
    console.log(`\nWebhooks needing migration: ${count}`);

    if (count === 0) {
      console.log("No secrets to migrate. ✓");
      return;
    }

    // Step 3: Fetch all un-migrated webhooks
    const webhooks = await prisma.$queryRawUnsafe(
      `SELECT id, secret FROM "Webhook" WHERE "secret" IS NOT NULL AND "encryptedSecret" IS NULL`
    );
    console.log(`Fetched ${webhooks.length} webhooks for migration.\n`);

    // Step 4: Encrypt and update each one
    let successCount = 0;
    let errorCount = 0;

    for (const webhook of webhooks) {
      try {
        const encryptedSecret = encryptToken(webhook.secret);
        await prisma.$executeRawUnsafe(
          `UPDATE "Webhook" SET "encryptedSecret" = $1 WHERE id = $2`,
          encryptedSecret,
          webhook.id
        );
        successCount++;
        if (successCount % 10 === 0) {
          console.log(`Progress: ${successCount}/${count} migrated`);
        }
      } catch (error) {
        console.error(`Failed to migrate webhook ${webhook.id}:`, error.message);
        errorCount++;
      }
    }

    // Step 5: Summary
    console.log("\n=== Migration Complete ===");
    console.log(`Total:    ${count}`);
    console.log(`Success:  ${successCount}`);
    console.log(`Errors:   ${errorCount}`);

    if (errorCount > 0) {
      console.log("\n⚠️  Some webhooks failed. Check the errors above and retry.");
      process.exit(1);
    }

    // Step 6: Verification
    const remaining = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "Webhook" WHERE "secret" IS NOT NULL AND "encryptedSecret" IS NULL`
    );
    const remainingCount = Number(remaining[0].count);
    console.log(`\nRemaining un-migrated: ${remainingCount}`);
    if (remainingCount === 0) {
      console.log("\n✓ All secrets migrated successfully!");
      console.log("\nNext steps:");
      console.log("  1. Verify a sample of encryptedSecret values are valid AES-GCM format");
      console.log("  2. Deploy code that reads encryptedSecret instead of secret");
      console.log("  3. Run: ALTER TABLE \"Webhook\" DROP COLUMN \"secret\";");
    }
  } catch (error) {
    console.error("\nFatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
