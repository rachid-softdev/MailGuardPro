import crypto from "node:crypto";

/**
 * API key hashing utilities.
 *
 * # Pepper rotation strategy
 *
 * Current: HMAC-SHA256 with a single server-side pepper (API_KEY_PEPPER).
 *
 * To rotate the pepper in production:
 * 1. Add the new pepper as API_KEY_PEPPER_V2 in the environment
 * 2. Update hashApiKey() to try V2 first, then V1 on mismatch
 * 3. On V1 match, re-hash with V2 and update the stored hash
 * 4. After all keys have migrated (verify via DB scan), remove V1 code
 *
 * Future: prefix stored hashes with "v1:" to support multi-version lookup.
 * Example stored format: "v1:<64-char-hex>"
 */

const PEPPER = process.env.API_KEY_PEPPER;
if (!PEPPER) {
  throw new Error(
    "API_KEY_PEPPER is not defined — set it in environment before deploying. " +
      "See crypto.ts for rotation strategy.",
  );
}

/**
 * Hash an API key for storage using HMAC-SHA256 with a server-side pepper.
 * The pepper prevents rainbow-table attacks if the DB is leaked.
 */
export function hashApiKey(key: string): string {
  const hmac = crypto.createHmac("sha256", PEPPER);
  hmac.update(key);
  return hmac.digest("hex");
}

/**
 * Legacy SHA-256 hash for backward compatibility during migration.
 * Only used as a fallback lookup — never for new keys.
 */
export function hashApiKeyLegacy(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
