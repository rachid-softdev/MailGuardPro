import crypto from "crypto";

// === TOKEN ENCRYPTION ===

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "hex").length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return key;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, "hex"), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return ciphertext; // not encrypted
    const [ivHex, authTagHex, encrypted] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(key, "hex"),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[Crypto] Token decryption failed:", error);
    throw new Error("Failed to decrypt token — possible key rotation or data corruption");
  }
}

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

function getPepper(): string {
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper) {
    throw new Error(
      "API_KEY_PEPPER is not defined — set it in environment before deploying. " +
        "See crypto.ts for rotation strategy.",
    );
  }
  return pepper;
}

/**
 * Hash an API key for storage using HMAC-SHA256 with a server-side pepper.
 * The pepper prevents rainbow-table attacks if the DB is leaked.
 */
export function hashApiKey(key: string): string {
  const hmac = crypto.createHmac("sha256", getPepper());
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
