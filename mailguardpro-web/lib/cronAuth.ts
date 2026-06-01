/**
 * Shared authentication and rate limiting for cron job endpoints.
 *
 * All cron endpoints share a CRON_SECRET and must:
 *   1. Validate the Bearer token with timing-safe comparison
 *   2. Log failed authentication attempts for observability
 *   3. Apply a basic rate limit (max 1 request per 5 minutes per cron)
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
import { redis } from "./redis";
import { timingSafeEqual } from "./timingSafe";

async function checkCronRateLimit(endpoint: string): Promise<boolean> {
  const key = `cron:ratelimit:${endpoint}`;
  try {
    const acquired = await redis.set(key, "1", "EX", 300, "NX"); // 5 minutes
    return acquired !== null;
  } catch {
    logger.warn({ endpoint }, "[Cron] Redis unavailable for rate limit — allowing");
    return true; // Allow if Redis is down (cron is better than no cron)
  }
}

/**
 * Report a security event to Sentry (non-blocking, swallow errors).
 */
function reportToSentry(message: string, extra: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "production") return;
  // Dynamic import to avoid loading Sentry in dev/test
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(message, { level: "warning", extra });
    })
    .catch(() => {
      // Sentry not available
    });
}

export async function verifyCronRequest(
  req: NextRequest,
  endpointName: string,
): Promise<{ authorized: boolean; response?: NextResponse }> {
  const CRON_SECRET = process.env.CRON_SECRET;

  if (!CRON_SECRET) {
    logger.error({ endpointName }, "[Cron] CRON_SECRET is not configured");
    return {
      authorized: false,
      response: NextResponse.json({ error: "Server configuration error" }, { status: 500 }),
    };
  }

  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${CRON_SECRET}`;
  if (!timingSafeEqual(authHeader ?? "", expected)) {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    logger.error(
      { endpointName, ip, method: req.method, path: req.nextUrl.pathname },
      "[Cron] Unauthorized access attempt",
    );
    reportToSentry(`Cron auth failure: ${endpointName}`, {
      endpoint: endpointName,
      ip,
      path: req.nextUrl.pathname,
    });
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimitOk = await checkCronRateLimit(endpointName);
  if (!rateLimitOk) {
    logger.warn({ endpointName }, "[Cron] Rate limit exceeded");
    return {
      authorized: false,
      response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }

  return { authorized: true };
}
