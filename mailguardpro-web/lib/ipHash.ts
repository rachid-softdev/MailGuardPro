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
    // Fallback : SHA-256 simple (moins sécurisé mais évite le stockage en clair)
    return crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16);
  }
  return crypto.createHmac("sha256", IP_HASH_KEY).update(ip).digest("hex").substring(0, 16);
}
