// Detection of disposable email domains

import { redis } from "@/lib/redis";
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
      const domains: string[] = JSON.parse(cached);
      for (const domain of domains) KNOWN_DISPOSABLE_DOMAINS.add(domain);
      console.log(`[Disposable] Loaded ${domains.length} domains from Redis cache`);
      return;
    }
  } catch {}
  const result = await syncDisposableDomains();
  if (result.added > 0) {
    console.log(`[Disposable] Synced ${result.added} domains`);
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
export async function syncDisposableDomains(): Promise<{ added: number }> {
  try {
    const response = await fetch(DISPOSABLE_LIST_URL, {
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
    console.error("Failed to sync disposable domains:", error);
    return { added: 0 };
  }
}
