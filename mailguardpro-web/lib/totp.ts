// Two-factor authentication primitives (TOTP, RFC 6238 + recovery codes).
//
// Deliberately dependency-free: HMAC-SHA1 TOTP, base32 (RFC 4648) and the
// recovery code helpers are built on node:crypto only.
//
// Parameters: 6 digits, 30-second step, SHA-1 — interoperable with Google
// Authenticator, Authy, 1Password, etc.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// 32 unambiguous characters (no I, O, 0, 1)
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Encode bytes as RFC 4648 base32 (no padding). */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decode RFC 4648 base32 (case-insensitive, accepts spaces and padding). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  if (clean.length === 0) {
    throw new Error("Invalid base32 string: empty");
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 string: unexpected character");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a fresh 160-bit TOTP secret (base32). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Compute the TOTP code for a given instant (defaults to now). */
export function totpCode(secret: string, timestampMs: number = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a user-submitted TOTP code, tolerating clock drift of ±1 step by
 * default. Comparisons are timing-safe.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options?: { window?: number; nowMs?: number },
): boolean {
  const window = options?.window ?? 1;
  const nowMs = options?.nowMs ?? Date.now();
  const normalized = code.replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) {
    return false;
  }
  const provided = Buffer.from(normalized);
  for (let offset = -window; offset <= window; offset++) {
    const candidate = Buffer.from(totpCode(secret, nowMs + offset * TOTP_STEP_SECONDS * 1000));
    if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) {
      return true;
    }
  }
  return false;
}

/** Generate one-time recovery codes (format "XXXXX-XXXXX"). */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let raw = "";
    const bytes = randomBytes(10);
    for (const byte of bytes) {
      // 256 % 32 === 0 → modulo is uniform
      raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    }
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalize a recovery code for hashing/lookup (case- and separator-insensitive). */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** sha256 hash stored server-side for a recovery code. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Parse the stored JSON array of recovery code hashes (defensive). */
export function parseStoredRecoveryCodeHashes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Build the otpauth:// provisioning URI for authenticator apps. */
export function buildOtpAuthUri(params: {
  secret: string;
  account: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? "MailGuard Pro";
  const label = encodeURIComponent(`${issuer}:${params.account}`);
  return (
    `otpauth://totp/${label}` +
    `?secret=${params.secret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}
