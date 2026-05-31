/**
 * Script de migration des tokens OAuth legacy (non chiffrés).
 *
 * Avant : les tokens (access_token, refresh_token, id_token) étaient stockés
 *         en clair dans la base de données.
 * Après : tous les tokens sont chiffrés avec AES-256-GCM.
 *
 * Exécution : npx tsx scripts/migrate-legacy-tokens.ts
 *
 * Ce script est IDEMPOTENT : il ne rechiffre que les tokens non chiffrés.
 * Un token est considéré comme non chiffré s'il ne contient pas le format
 * "iv:authTag:ciphertext" (i.e., ne contient pas de ":").
 */

import { PrismaClient } from "@prisma/client";
import { createCipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "hex").length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return key;
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function isLegacyToken(value: string | null): boolean {
  if (!value) return false;
  // Les tokens chiffrés ont toujours le format "iv:authTag:ciphertext" (2 deux-points)
  // Les tokens legacy en hex n'ont pas de deux-points
  return !value.includes(":");
}

async function migrateTokens() {
  const prisma = new PrismaClient();

  try {
    console.log("🔍 Searching for legacy tokens...");

    const accounts = await prisma.account.findMany({
      where: {
        OR: [
          { access_token: { not: null } },
          { refresh_token: { not: null } },
          { id_token: { not: null } },
        ],
      },
    });

    console.log(`📊 Found ${accounts.length} accounts with tokens`);

    let migratedCount = 0;
    const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

    // Traiter par lots de 100 pour éviter les timeouts
    const BATCH_SIZE = 100;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);

      await prisma.$transaction(
        batch
          .map((account) => {
            const updates: Record<string, string> = {};

            for (const field of TOKEN_FIELDS) {
              const value = (account as any)[field];
              if (isLegacyToken(value)) {
                updates[field] = encryptToken(value);
              }
            }

            if (Object.keys(updates).length > 0) {
              return prisma.account.update({
                where: { id: account.id },
                data: updates,
              });
            }
            return null;
          })
          .filter(Boolean) as any,
      );

      const batchMigrated = batch.filter((a) =>
        TOKEN_FIELDS.some((f) => isLegacyToken((a as any)[f])),
      ).length;
      migratedCount += batchMigrated;

      console.log(
        `  ✅ Batch ${i / BATCH_SIZE + 1}: ${batchMigrated} accounts migrated (${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length})`,
      );
    }

    console.log(`\n✨ Migration complete! ${migratedCount} accounts migrated.`);
    console.log(
      "⚠️  Now you can deploy the decryptToken() fix that removes the plaintext fallback.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

migrateTokens().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
