/**
 * CSRF protection via Origin / Referer header validation.
 *
 * Usage in API routes:
 *   const csrfCheck = validateCsrfOrigin(req);
 *   if (!csrfCheck.valid) {
 *     return NextResponse.json({ error: csrfCheck.error }, { status: 403 });
 *   }
 *
 * Relies on the origin / referer header matching the application's own origin.
 * This is effective because:
 *   - Browsers enforce same-origin policy on fetch/XMLHttpRequest
 *   - Form submissions include Origin header on modern browsers
 *   - Referer header is always present on same-origin POST navigations
 *
 * Not a replacement for CSRF tokens, but provides defense-in-depth.
 */

export interface CsrfCheckResult {
  valid: boolean;
  error?: string;
}

function getAppOrigin(): string {
  // Utiliser APP_ORIGIN (serveur uniquement) en priorité
  // NEXT_PUBLIC_APP_URL est publique (accessible au client) — ne pas l'utiliser pour la sécu
  return process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Validate the Origin or Referer header against the application's expected origin.
 * Skips validation for:
 *   - API key authenticated requests (not subject to CSRF as they don't use cookies)
 *   - Requests matching skipPaths (e.g., Stripe webhook which uses HMAC signature)
 *
 * Returns { valid: true } or { valid: false, error: "..." }.
 */
export function validateCsrfOrigin(
  req: Request,
  options?: { skipPaths?: string[] },
): CsrfCheckResult {
  // Skip CSRF check for specific paths (e.g., Stripe webhook which uses HMAC)
  if (options?.skipPaths) {
    try {
      const url = new URL(req.url);
      if (options.skipPaths.some((path) => url.pathname.startsWith(path))) {
        return { valid: true };
      }
    } catch {
      /* ignore URL parse errors */
    }
  }

  // If the request has an X-API-Key header, it's not cookie-authenticated → no CSRF risk
  if (req.headers.get("X-API-Key")) {
    return { valid: true };
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // REJECT if both Origin and Referer are missing
  if (!origin && !referer) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[CSRF] Missing Origin and Referer headers — rejecting mutation request");
    }
    return { valid: false, error: "Missing Origin and Referer headers" };
  }

  const appOrigin = getAppOrigin();

  // Check Origin header if present
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.origin !== appOrigin) {
        return { valid: false, error: `Origin not allowed: ${origin}` };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid Origin header" };
    }
  }

  // Fallback to Referer header if Origin is not present
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin !== appOrigin) {
        return { valid: false, error: `Referer not allowed: ${referer}` };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid Referer header" };
    }
  }

  return { valid: true };
}
