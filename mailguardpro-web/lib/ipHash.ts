import crypto from "crypto";

const IP_HASH_KEY = process.env.IP_HASH_KEY;
if (!IP_HASH_KEY) {
  console.warn("[IPHash] IP_HASH_KEY is not defined — IPs will not be hashed");
}

export function hashIp(ip: string): string {
  if (!IP_HASH_KEY) return ip; // No key configured, return as-is
  return crypto.createHmac("sha256", IP_HASH_KEY).update(ip).digest("hex").substring(0, 16); // Truncate to 16 hex chars (64 bits) — sufficient for correlation
}
