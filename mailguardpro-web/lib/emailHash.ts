import crypto from "crypto";

const EMAIL_HASH_SALT = process.env.EMAIL_HASH_SALT;

if (!EMAIL_HASH_SALT) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "EMAIL_HASH_SALT is required in production. " +
        "Set it to a random 32+ character string. " +
        "WARNING: Changing this salt will invalidate all existing email hashes.",
    );
  }
  console.warn(
    "[EmailHash] EMAIL_HASH_SALT is not defined — using insecure default for development",
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
