import crypto from "node:crypto";

const PEPPER = process.env.API_KEY_PEPPER;
if (!PEPPER) {
  throw new Error(
    "API_KEY_PEPPER is not defined — set it in environment before deploying",
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
