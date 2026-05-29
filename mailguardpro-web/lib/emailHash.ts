import crypto from "crypto";

const EMAIL_HASH_SALT = process.env.EMAIL_HASH_SALT;
if (!EMAIL_HASH_SALT) {
  console.warn(
    "[EmailHash] EMAIL_HASH_SALT is not defined — using default (INSECURE for production)",
  );
}

export function hashEmail(email: string): string {
  const salt = EMAIL_HASH_SALT || "dev-only-do-not-use-in-production";
  return crypto
    .createHash("sha256")
    .update(salt + email.toLowerCase().trim())
    .digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.charAt(0)}***@${domain}`;
}
