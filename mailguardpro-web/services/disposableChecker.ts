// Detection of disposable email domains

import { SCORING_WEIGHTS } from "@/config/scoringWeights";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { safeJsonParse } from "@/lib/safeJson";
import { validateWebhookUrlWithDns } from "@/lib/ssrf";
import { CheckResult } from "./types";

// Liste de domaines jetables connus (subset populaire)
const KNOWN_DISPOSABLE_DOMAINS = new Set([
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "spam4.me",
  "mailinator.com",
  "mailinator.net",
  "mailinator.org",
  "tempmail.com",
  "tempmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "10minutemail.com",
  "10minutemail.net",
  "throwaway.email",
  "getnada.com",
  "mintemail.com",
  "sharklasers.com",
  "spam.la",
  "trashmail.com",
  "trashmail.net",
  "maildrop.cc",
  "mytrashmail.com",
  "fakeinbox.com",
  "mailnesia.com",
  "tempr.email",
  "dispostable.com",
  "emailondeck.com",
  "mohmal.com",
  "temp-mail.io",
  "mail-temporaire.fr",
]);

// URL of the public blocklist (optional, can be used for weekly sync)
const DISPOSABLE_LIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_domains.txt";

interface DisposableResult extends CheckResult {
  provider?: string;
}

export async function checkDisposable(email: string): Promise<DisposableResult> {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) {
    return {
      passed: true,
      weight: SCORING_WEIGHTS.disposable.pass,
      message: "Domaine invalide",
    };
  }

  // 1. Check Redis cache
  try {
    const cached = await redis.get(`disposable:${domain}`);
    if (cached !== null) {
      const isDisposable = cached === "1";
      return {
        passed: !isDisposable,
        weight: isDisposable ? SCORING_WEIGHTS.disposable.fail : SCORING_WEIGHTS.disposable.pass,
        message: isDisposable ? "Email jetable" : "Email non-jetable",
        detail: isDisposable ? `Domaine ${domain} connu comme jetable` : undefined,
        provider: cached === "1" ? "cache" : undefined,
      };
    }
  } catch {
    // Redis unavailable, continue with built-in list
  }

  // 2. Check built-in list
  if (KNOWN_DISPOSABLE_DOMAINS.has(domain)) {
    // Mettre en cache pour 24h
    try {
      await redis.setex(`disposable:${domain}`, 86400, "1");
    } catch {
      // Redis non disponible
    }

    return {
      passed: false,
      weight: SCORING_WEIGHTS.disposable.fail,
      message: "Email jetable",
      detail: `${domain} est un domaine d'email temporaire connu`,
      provider: "builtin-list",
    };
  }

  // Not found -> not disposable
  try {
    await redis.setex(`disposable:${domain}`, 86400, "0");
  } catch {
    // Redis non disponible
  }

  return {
    passed: true,
    weight: SCORING_WEIGHTS.disposable.pass,
    message: "Email non-jetable",
    detail: undefined,
  };
}

let initialized = false;
export async function initializeDisposableDomains(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const cached = await redis.get("disposable:sync:all");
    if (cached) {
      const domains: string[] = safeJsonParse<string[]>(cached);
      for (const domain of domains) KNOWN_DISPOSABLE_DOMAINS.add(domain);
      logger.info({ domainCount: domains.length }, "Loaded domains from Redis cache");
      return;
    }
  } catch {}
  const result = await syncDisposableDomains();
  if (result.added > 0) {
    logger.info({ added: result.added }, "Synced disposable domains");
    try {
      await redis.setex(
        "disposable:sync:all",
        86400,
        JSON.stringify([...KNOWN_DISPOSABLE_DOMAINS]),
      );
    } catch {}
  }
}

// Function to sync the blocklist (called by cron)
export async function syncDisposableDomains(url?: string): Promise<{ added: number }> {
  const targetUrl = url || DISPOSABLE_LIST_URL;

  // SSRF protection: si l'URL est personnalisée, valider avec DNS
  if (url) {
    const validation = await validateWebhookUrlWithDns(url);
    if (!validation.valid) {
      logger.error({ error: validation.error }, "SSRF validation failed for custom URL");
      return { added: 0 };
    }
  }

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch list");
    }

    const text = await response.text();
    const domains = text
      .split("\n")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    // Add to built-in list
    for (const domain of domains) {
      KNOWN_DISPOSABLE_DOMAINS.add(domain);
    }

    return { added: domains.length };
  } catch (error) {
    logger.error({ err: error }, "Failed to sync disposable domains");
    return { added: 0 };
  }
}
