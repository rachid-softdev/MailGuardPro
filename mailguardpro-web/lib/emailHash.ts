import crypto from "crypto";

const EMAIL_HASH_SALT = process.env.EMAIL_HASH_SALT;

export function hashEmail(email: string): string {
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
    return crypto
      .createHmac("sha256", "dev-only-do-not-use-in-production")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }
  return crypto
    .createHmac("sha256", EMAIL_HASH_SALT)
    .update(email.toLowerCase().trim())
    .digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.charAt(0)}***@${domain}`;
}
