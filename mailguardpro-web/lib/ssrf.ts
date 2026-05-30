import { isIP } from "net";
import dns from "dns/promises";

const IPV4_MAPPED_IPV6_RE = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;

const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "0:0:0:0:0:0:0:1",
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
  /^::$/,
];

/**
 * Validates a resolved IP address before making a TCP connection.
 * Blocks private, loopback, link-local addresses.
 */
export function validateResolvedIp(ip: string): { valid: boolean; error?: string } {
  const normalizedIp = ip.toLowerCase();
  if (isIP(normalizedIp) === 0) {
    return { valid: false, error: `Invalid IP address: ${ip}` };
  }

  // Normalize IPv4-mapped IPv6 (::ffff:x.x.x.x → x.x.x.x) for pattern matching
  const v4MappedMatch = normalizedIp.match(IPV4_MAPPED_IPV6_RE);
  const ipToCheck = v4MappedMatch ? v4MappedMatch[1] : normalizedIp;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ipToCheck)) {
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
  // new URL() retains brackets for IPv6 on some Node.js versions, strip them for matching
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.includes(normalizedHostname)) {
    return { valid: false, error: "Internal hostnames are not allowed" };
  }

  if (isIP(normalizedHostname)) {
    // Normalize IPv4-mapped IPv6 (::ffff:x.x.x.x → x.x.x.x) for pattern matching
    const v4MappedMatch = normalizedHostname.match(IPV4_MAPPED_IPV6_RE);
    const ipToCheck = v4MappedMatch ? v4MappedMatch[1] : normalizedHostname;
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(ipToCheck)) {
        return { valid: false, error: "Private IP ranges are not allowed" };
      }
    }
    // Block direct public IPs — require domain names
    return { valid: false, error: "Domain names only, no direct IP addresses" };
  }

  return { valid: true };
}

/**
 * Validates a webhook URL including DNS resolution of the hostname.
 * Resolves the hostname to IP addresses and validates each one.
 * This prevents DNS rebinding attacks where a hostname resolves to
 * a private/internal IP after the initial validation.
 */
export async function validateWebhookUrlWithDns(urlString: string): Promise<{
  valid: boolean;
  error?: string;
  resolvedIps?: string[];
}> {
  const baseCheck = validateWebhookUrl(urlString);
  if (!baseCheck.valid) {
    return baseCheck;
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // If it's already an IP, validateWebhookUrl already rejected it
  if (isIP(hostname) !== 0) {
    return baseCheck;
  }

  // Resolve the hostname to IPs - try IPv4 with IPv6 fallback
  let resolvedIps: string[];
  try {
    resolvedIps = await dns.resolve4(hostname);
  } catch {
    // IPv4 resolution failed — try IPv6 as fallback
    try {
      resolvedIps = await dns.resolve6(hostname);
    } catch (dnsError) {
      console.warn(`[SSRF] DNS resolution failed for ${hostname}:`, dnsError);
      return { valid: false, error: `Cannot resolve hostname: ${hostname}` };
    }
  }

  // If IPv4 returned empty, try IPv6
  if (resolvedIps.length === 0) {
    try {
      resolvedIps = await dns.resolve6(hostname);
    } catch (dnsError) {
      console.warn(`[SSRF] DNS resolution failed for ${hostname}:`, dnsError);
      return { valid: false, error: `Cannot resolve hostname: ${hostname}` };
    }
  }

  // Validate each resolved IP
  for (const ip of resolvedIps) {
    const ipCheck = validateResolvedIp(ip);
    if (!ipCheck.valid) {
      return { valid: false, error: `Webhook resolves to blocked IP: ${ip} - ${ipCheck.error}` };
    }
  }

  return { valid: true, resolvedIps };
}

/**
 * Résout un hostname, valide les IPs, et retourne la liste des IPs valides.
 * Utilisé pour le DNS pinning : les IPs sont stockées en DB à la création
 * et comparées au moment du dispatch pour prévenir le DNS rebinding.
 *
 * Retourne un tableau d'IPs (string[]) ou une erreur.
 */
export async function resolveWebhookIps(hostname: string): Promise<{
  valid: boolean;
  ips?: string[];
  error?: string;
}> {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Rejeter si c'est une IP directe (on exige un nom de domaine)
  if (isIP(normalizedHostname) !== 0) {
    return { valid: false, error: "Domain names only, no direct IP addresses" };
  }

  // Résoudre IPv4 avec fallback IPv6
  let resolvedIps: string[];
  try {
    resolvedIps = await dns.resolve4(normalizedHostname);
  } catch {
    try {
      resolvedIps = await dns.resolve6(normalizedHostname);
    } catch {
      return { valid: false, error: `Cannot resolve hostname: ${normalizedHostname}` };
    }
  }

  if (resolvedIps.length === 0) {
    try {
      resolvedIps = await dns.resolve6(normalizedHostname);
    } catch {
      return { valid: false, error: `Cannot resolve hostname: ${normalizedHostname}` };
    }
  }

  // Valider chaque IP
  for (const ip of resolvedIps) {
    const ipCheck = validateResolvedIp(ip);
    if (!ipCheck.valid) {
      return { valid: false, error: `Blocked IP: ${ip} - ${ipCheck.error}` };
    }
  }

  return { valid: true, ips: resolvedIps };
}

/**
 * Extract the client IP from a request, with validation.
 * Parses X-Forwarded-For chain and takes the first valid IP.
 */
export function getClientIp(req: { headers: Headers | Map<string, string> }): string {
  // 1. X-Real-IP (set by Nginx/Cloudflare, more trustworthy)
  const realIp =
    typeof req.headers.get === "function"
      ? req.headers.get("x-real-ip")
      : (req.headers as Map<string, string>).get("x-real-ip");
  if (realIp && isIP(realIp) !== 0) return realIp;

  // 2. CF-Connecting-IP (Cloudflare)
  const cfIp =
    typeof req.headers.get === "function"
      ? req.headers.get("cf-connecting-ip")
      : (req.headers as Map<string, string>).get("cf-connecting-ip");
  if (cfIp && isIP(cfIp) !== 0) return cfIp;

  // 3. X-Forwarded-For — take the LAST IP (closest to server)
  const xff =
    typeof req.headers.get === "function"
      ? req.headers.get("x-forwarded-for")
      : (req.headers as Map<string, string>).get("x-forwarded-for");
  if (xff) {
    const ips = xff
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    // Take the last valid IP (after proxies)
    for (let i = ips.length - 1; i >= 0; i--) {
      if (isIP(ips[i]) !== 0) return ips[i];
    }
  }

  return "unknown";
}
