import { isIP } from "net";

const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "[::]",
  "[0:0:0:0:0:0:0:1]",
  "metadata.google.internal",
  "169.254.169.254",
  "metadata.internal",
];

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f][0-9a-f]:/i,
  /^ff00:/i,
  /^fe80:/i,
];

/**
 * Validates a resolved IP address before making a TCP connection.
 * Blocks private, loopback, link-local addresses.
 */
export function validateResolvedIp(ip: string): { valid: boolean; error?: string } {
  const normalizedIp = ip.toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(normalizedIp)) {
      return { valid: false, error: `Blocked private IP range: ${ip}` };
    }
  }
  return { valid: true };
}

export function validateWebhookUrl(urlString: string): {
  valid: boolean;
  error?: string;
} {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS URLs are allowed" };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: "Internal hostnames are not allowed" };
  }

  if (isIP(hostname)) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Private IP ranges are not allowed" };
      }
    }
    // Block direct public IPs — require domain names
    return { valid: false, error: "Domain names only, no direct IP addresses" };
  }

  return { valid: true };
}
