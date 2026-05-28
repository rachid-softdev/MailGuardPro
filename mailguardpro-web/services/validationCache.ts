// Validation Cache Service
// Cache les résultats de validation pour améliorer les performances

import { checkRateLimit, redis } from "@/lib/redis";
import { ValidationResult } from "./types";

// TTL: 4 hours for validation results
const CACHE_TTL_SECONDS = 60 * 60 * 4;

// TTL plus court pour les domaines (les MX peuvent changer)
const DOMAIN_CACHE_TTL_SECONDS = 60 * 60 * 2; // 2 heures

/**
 * Get cached validation result for an email
 */
export async function getCachedValidation(email: string): Promise<ValidationResult | null> {
  try {
    const cached = await redis.get(`validation:${email.toLowerCase()}`);
    if (cached) {
      return JSON.parse(cached) as ValidationResult;
    }
  } catch (error) {
    console.error("[ValidationCache] Get error:", error);
  }
  return null;
}

/**
 * Set cached validation result for an email
 */
export async function setCachedValidation(email: string, result: ValidationResult): Promise<void> {
  try {
    await redis.setex(
      `validation:${email.toLowerCase()}`,
      CACHE_TTL_SECONDS,
      JSON.stringify(result),
    );
  } catch (error) {
    console.error("[ValidationCache] Set error:", error);
  }
}

/**
 * Invalidate cached validation for an email
 */
export async function invalidateValidationCache(email: string): Promise<void> {
  try {
    await redis.del(`validation:${email.toLowerCase()}`);
  } catch (error) {
    console.error("[ValidationCache] Invalidate error:", error);
  }
}

/**
 * Get cached domain checks (MX, SPF, DMARC, etc.)
 * These can be shared across multiple emails from the same domain
 */
export async function getCachedDomainChecks(domain: string): Promise<{
  mx?: any;
  spf?: any;
  dmarc?: any;
  dnsbl?: any;
} | null> {
  try {
    const cached = await redis.get(`domain-checks:${domain}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("[ValidationCache] Get domain checks error:", error);
  }
  return null;
}

/**
 * Set cached domain checks
 */
export async function setCachedDomainChecks(
  domain: string,
  checks: {
    mx?: any;
    spf?: any;
    dmarc?: any;
    dnsbl?: any;
  },
): Promise<void> {
  try {
    await redis.setex(`domain-checks:${domain}`, DOMAIN_CACHE_TTL_SECONDS, JSON.stringify(checks));
  } catch (error) {
    console.error("[ValidationCache] Set domain checks error:", error);
  }
}

/**
 * Check if email was recently validated (within last hour)
 * Use this for rate limiting validation cache
 */
export async function getRecentValidationCount(email: string): Promise<number> {
  try {
    const key = `recent-validation:${email.toLowerCase()}`;
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    console.error("[ValidationCache] Recent count error:", error);
    return 0;
  }
}

/**
 * Increment recent validation count
 */
export async function incrementRecentValidation(email: string): Promise<void> {
  try {
    const key = `recent-validation:${email.toLowerCase()}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60 * 60); // 1 hour TTL
    }
  } catch (error) {
    console.error("[ValidationCache] Increment error:", error);
  }
}

/**
 * Clear all validation caches (for admin/maintenance)
 * Uses SCAN with cursor-based iteration and UNLINK (non-blocking) instead of KEYS + DEL.
 */
export async function clearAllValidationCaches(): Promise<number> {
  let cleared = 0;
  const patterns = ["validation:*", "domain-checks:*", "recent-validation:*"];

  try {
    for (const pattern of patterns) {
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: pattern,
          count: 100,
        });
        cursor = parseInt(nextCursor, 10);

        if (keys.length > 0) {
          await redis.unlink(...keys);
          cleared += keys.length;
        }
      } while (cursor !== 0);
    }
  } catch (error) {
    console.error("[ValidationCache] Clear all error:", error);
  }

  return cleared;
}

/**
 * Per-email rate limiting to prevent enumeration attacks.
 * Allows 5 validation requests per email per hour.
 * Fail-open: returns true (allow) if Redis is unavailable.
 */
export async function checkEmailRateLimit(email: string): Promise<boolean> {
  try {
    const result = await checkRateLimit(`smtp-rate:${email.toLowerCase()}`, 5, 3600);
    return result.success;
  } catch {
    return true; // Fail open
  }
}
