// Score de réputation de domaine - Optimisé pour la performance avec fallbacks multiples

import dns from "dns/promises";
import type { WhoisResult } from "whois";
import { lookup } from "whois";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { safeJsonParse } from "@/lib/safeJson";
import { validateResolvedIp } from "@/lib/ssrf";
import { DomainInfo } from "./types";

// Timeouts pour éviter de bloquer sur une API lente
const RDAP_TIMEOUT_MS = 3000;
const WHOIS_TIMEOUT_MS = 3000;

// Known old domains - fallback pour les domaines connus
const KNOWN_OLD_DOMAINS = new Set([
  "google.com",
  "googlemail.com",
  "microsoft.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "apple.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "aim.com",
  "facebook.com",
  "instagram.com",
  "whatsapp.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "github.com",
  "amazon.com",
  "aws.amazon.com",
  "netflix.com",
  "reddit.com",
  "shopify.com",
  "slack.com",
  "zoom.us",
  "dropbox.com",
  "adobe.com",
  "shop.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
]);

// Helper pour fetch avec timeout
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  options: RequestInit = {},
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Parser la réponse RDAP pour extraire la date de création
function parseRdapResponse(data: any): { createdAt?: string; ageInDays?: number } | null {
  const creationEvent = data.events?.find(
    (e: any) => e.eventAction === "registration" || e.eventAction === "creation",
  );

  if (creationEvent?.eventDate) {
    const created = new Date(creationEvent.eventDate);
    const ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

    return {
      createdAt: creationEvent.eventDate,
      ageInDays,
    };
  }

  // Fallback: check network (handle)
  if (data.handle) {
    // Domain exists but no creation date - assume relatively old
    return { createdAt: undefined, ageInDays: 365 };
  }

  return null;
}

// Fetch RDAP avec timeout
async function fetchRDAP(
  domain: string,
): Promise<{ createdAt?: string; ageInDays?: number } | null> {
  // Check Redis cache first
  try {
    const cached = await redis.get(`domain_age:${domain}`);
    if (cached) {
      return safeJsonParse(cached);
    }
  } catch {
    // Redis not available, continue
  }

  const response = await fetchWithTimeout(`https://rdap.org/domain/${domain}`, RDAP_TIMEOUT_MS);

  if (!response?.ok) return null;

  try {
    const data = await response.json();
    const result = parseRdapResponse(data);

    // Cache result
    if (result) {
      try {
        await redis.setex(`domain_age:${domain}`, 86400 * 7, JSON.stringify(result)); // 7 days
      } catch {
        // Redis not available
      }
    }

    return result;
  } catch {
    return null;
  }
}

// Fetch WHOIS via node-whois with SSRF protection
async function fetchWHOIS(
  domain: string,
): Promise<{ createdAt?: string; ageInDays?: number } | null> {
  try {
    // SSRF protection: resolve domain to IP and verify it's a public address
    // The WHOIS lookup connects to the TLD's WHOIS server (e.g., whois.verisign-grs.com),
    // not to the domain itself. However, this validation prevents lookups for
    // domains that could cause connections to internal hosts.
    const resolvedIps = await dns.resolve4(domain).catch(() => null);
    if (resolvedIps && resolvedIps.length > 0) {
      for (const ip of resolvedIps) {
        const ipCheck = validateResolvedIp(ip);
        if (!ipCheck.valid) {
          logger.warn({ domain, ip }, "Skipping WHOIS — resolves to blocked IP");
          return null;
        }
      }
    }
    // If resolution fails (NXDOMAIN), skip WHOIS entirely (domain likely doesn't exist)
    if (!resolvedIps) {
      return null;
    }

    const rawData = await new Promise<string | WhoisResult[]>((resolve, reject) => {
      lookup(domain, { timeout: WHOIS_TIMEOUT_MS }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    const whoisData: string = Array.isArray(rawData)
      ? rawData.map((r) => r.data).join("\n")
      : rawData;
    const patterns = [
      /Creation Date:\s*(.+)/i,
      /created:\s*(.+)/i,
      /Domain Registration Date:\s*(.+)/i,
      /Domain Create Date:\s*(.+)/i,
      /Registration Time:\s*(.+)/i,
      /registered:\s*(.+)/i,
      /Created on:\s*(.+)/i,
    ];
    for (const pattern of patterns) {
      const match = whoisData.match(pattern);
      if (match) {
        const created = new Date(match[1].trim());
        const ageInDays = Math.floor((Date.now() - created.getTime()) / 86400000);
        return { createdAt: match[1].trim(), ageInDays };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Check if domain is in known old domains list
function checkKnownOldDomains(domain: string): { createdAt?: string; ageInDays?: number } | null {
  // Check exact match
  if (KNOWN_OLD_DOMAINS.has(domain.toLowerCase())) {
    return { createdAt: undefined, ageInDays: 365 * 5 }; // Assume 5+ years
  }

  // Check if it's a well-known TLD
  const knownTlds = [".com", ".net", ".org", ".io", ".co", ".edu", ".gov"];
  const isKnownTld = knownTlds.some((tld) => domain.toLowerCase().endsWith(tld));

  if (isKnownTld) {
    // Most .com/.net domains are older, give them a reasonable age
    return { createdAt: undefined, ageInDays: 365 * 3 }; // Assume 3+ years
  }

  return null;
}

// Récupérer l'âge du domaine - Version avec multiples fallbacks
export async function getDomainAge(
  domain: string,
): Promise<{ createdAt?: string; ageInDays?: number }> {
  // 1. Check cache (Redis)
  try {
    const cached = await redis.get(`domain_age:${domain}`);
    if (cached) {
      return safeJsonParse(cached);
    }
  } catch {
    // Redis not available
  }

  // 2. Check known old domains
  const knownResult = checkKnownOldDomains(domain);
  if (knownResult) {
    return knownResult;
  }

  // 3. Try RDAP and WHOIS in parallel
  const [rdapResult, whoisResult] = await Promise.all([
    fetchRDAP(domain).catch(() => null),
    fetchWHOIS(domain).catch(() => null),
  ]);

  // 4. Take the first valid result
  if (rdapResult) return rdapResult;
  if (whoisResult) return whoisResult;

  // 5. If nothing works, return empty (neutral reputation)
  return {};
}

// Calculer la réputation du domaine basée sur plusieurs facteurs
export async function getDomainReputation(domain: string): Promise<DomainInfo> {
  const ageInfo = await getDomainAge(domain);

  // Calculer le score de réputation (0-100)
  let reputationScore = 50; // baseline

  // Facteur 1: Âge du domaine
  if (ageInfo.ageInDays) {
    if (ageInfo.ageInDays > 365 * 5) {
      reputationScore += 25; // Domaine très ancien (5+ ans)
    } else if (ageInfo.ageInDays > 365 * 2) {
      reputationScore += 15; // Domaine ancien (2+ ans)
    } else if (ageInfo.ageInDays > 365) {
      reputationScore += 5; // Domaine établi (1+ an)
    } else if (ageInfo.ageInDays < 30) {
      reputationScore -= 30; // Domaine très récent
    } else if (ageInfo.ageInDays < 90) {
      reputationScore -= 15; // Domaine récent
    } else if (ageInfo.ageInDays < 180) {
      reputationScore -= 5; // Domaine assez récent
    }
  }

  // Facteur 2: Vérifier si c'est un domaine connu (TLDs populaires)
  const knownTlds = [".com", ".net", ".org", ".io", ".co"];
  const isKnownTld = knownTlds.some((tld) => domain.endsWith(tld));
  if (isKnownTld) {
    reputationScore += 5;
  }

  // Facteur 3: Domaine avec plusieurs sous-domaines peut indiquer un service établi
  const subdomainCount = (domain.match(/\./g) || []).length;
  if (subdomainCount > 1) {
    reputationScore += 5;
  }

  // Déterminer la catégorie finale
  let reputation: "good" | "neutral" | "poor";

  if (reputationScore >= 65) {
    reputation = "good";
  } else if (reputationScore >= 40) {
    reputation = "neutral";
  } else {
    reputation = "poor";
  }

  return {
    name: domain,
    createdAt: ageInfo.createdAt,
    ageInDays: ageInfo.ageInDays,
    reputation,
  };
}
