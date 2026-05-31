// File: lib/csrf.ts — CSRF protection via Origin/Referer header validation

export interface CsrfCheckResult {
  valid: boolean;
  error?: string;
}

function getAppOrigin(): string {
  return process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "";
}

function isLocalhostOrigin(originOrReferer: string): boolean {
  try {
    const url = new URL(originOrReferer);
    const hostname = url.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function validateCsrfOrigin(
  req: Request,
  options?: { skipPaths?: string[] },
): CsrfCheckResult {
  // Skip CSRF check for specific paths (e.g., Stripe webhooks)
  if (options?.skipPaths) {
    try {
      const url = new URL(req.url);
      if (options.skipPaths.some((path) => url.pathname.startsWith(path))) {
        return { valid: true };
      }
    } catch {
      /* ignore */
    }
  }

  // If request has X-API-Key header, no cookie-based CSRF risk
  if (req.headers.get("X-API-Key")) {
    return { valid: true };
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  if (!origin && !referer) {
    return {
      valid: false,
      error: "Missing Origin and Referer headers",
    };
  }

  const appOrigin = getAppOrigin();

  const isValidOrigin = (value: string): boolean => {
    try {
      const url = new URL(value);
      const requestedOrigin = url.origin;

      // In development, allow any localhost origin (any port)
      if (process.env.NODE_ENV === "development" && isLocalhostOrigin(value)) {
        return true;
      }

      // In production, strict match against configured origin
      return requestedOrigin === appOrigin;
    } catch {
      return false;
    }
  };

  if (origin) {
    if (isValidOrigin(origin)) {
      return { valid: true };
    }
    return { valid: false, error: `Origin not allowed: ${origin}` };
  }

  if (referer) {
    if (isValidOrigin(referer)) {
      return { valid: true };
    }
    return { valid: false, error: `Referer not allowed: ${referer}` };
  }

  return { valid: true };
}
