import crypto from "crypto";

const IP_HASH_KEY = process.env.IP_HASH_KEY;

if (!IP_HASH_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "IP_HASH_KEY is required in production. " +
        "Set it to a random 32+ character string before deploying. " +
        "This key HMAC-hashes IP addresses for privacy compliance (GDPR).",
    );
  }
  console.warn("[IPHash] IP_HASH_KEY is not defined — using SHA-256 fallback (less secure)");
}

export function hashIp(ip: string): string {
  if (!IP_HASH_KEY) {
    // Fallback : HMAC-SHA256 avec une clé aléatoire par lancement
    const fallbackKey = crypto.randomBytes(16).toString("hex");
    console.warn("[IPHash] IP_HASH_KEY not defined — using per-run random key");
    return crypto.createHmac("sha256", fallbackKey).update(ip).digest("hex").substring(0, 16);
  }
  return crypto.createHmac("sha256", IP_HASH_KEY).update(ip).digest("hex").substring(0, 16);
}
