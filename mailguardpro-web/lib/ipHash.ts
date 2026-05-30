import crypto from "crypto";

const IP_HASH_KEY = process.env.IP_HASH_KEY;

// Cache de clé de fallback pour garantir la cohérence des hash dans un même process
let fallbackKey: string | null = null;

export function hashIp(ip: string): string {
  if (!IP_HASH_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "IP_HASH_KEY is required in production. " +
          "Set it to a random 32+ character string before deploying. " +
          "This key HMAC-hashes IP addresses for privacy compliance (GDPR).",
      );
    }
    // Fallback : HMAC-SHA256 avec une clé aléatoire unique par lancement
    if (!fallbackKey) {
      fallbackKey = crypto.randomBytes(16).toString("hex");
      console.warn("[IPHash] IP_HASH_KEY not defined — using per-run random key");
    }
    return crypto.createHmac("sha256", fallbackKey).update(ip).digest("hex").substring(0, 16);
  }
  return crypto.createHmac("sha256", IP_HASH_KEY).update(ip).digest("hex").substring(0, 16);
}
