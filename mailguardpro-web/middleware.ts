// NextAuth Middleware - Protection des routes + CSP with nonce

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCorsHeaders, handleCors } from "@/lib/cors";
import { getIdempotencyResult } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { checkMemoryRateLimit } from "@/lib/rateLimitMemory";

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildCsp(nonce: string): string {
  const stripeOrigins = process.env.CSP_STRIPE_ORIGINS || "https://js.stripe.com";
  const sentryOrigins = process.env.CSP_SENTRY_ORIGINS || "https://o*.ingest.sentry.io";
  const frameOrigins =
    process.env.CSP_FRAME_ORIGINS || "https://js.stripe.com https://hooks.stripe.com";
  const imgOrigins =
    process.env.CSP_IMG_ORIGINS ||
    "https://lh3.googleusercontent.com https://avatars.githubusercontent.com";

  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${stripeOrigins}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https: ${imgOrigins}`,
    `font-src 'self' data:`,
    `connect-src 'self' https: ${sentryOrigins}`,
    `frame-src 'self' ${frameOrigins}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export default auth(async (req) => {
  const requestHeaders = new Headers(req.headers);

  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Rate limiting for auth routes (20 req/min per IP — uses in-memory limiter
  // to avoid Redis dependency at the edge)
  if (req.nextUrl.pathname.startsWith("/api/auth")) {
    const ip =
      requestHeaders.get("x-real-ip") ||
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateCheck = await checkMemoryRateLimit(`auth:${ip}`, 20, 60);
    if (!rateCheck.success) {
      logger.warn({ ip }, "Rate limited auth IP");
      return NextResponse.json(
        { error: "Too many requests", retryAfter: rateCheck.resetAt },
        { status: 429 },
      );
    }
  }

  const nonce = generateNonce();

  const isLoggedIn = !!req.auth;

  // Idempotency-Key check for mutating requests (after auth check to prevent unauthenticated replay)
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const cached = await getIdempotencyResult(idempotencyKey);
      if (cached && isLoggedIn) {
        return NextResponse.json(cached.response, { status: cached.statusCode });
      }
      // Signal downstream handlers to cache the response
      requestHeaders.set("x-idempotency-key", idempotencyKey);
    }
  }

  const PROTECTED_ROUTES = [
    "/dashboard",
    "/validate",
    "/bulk",
    "/api-keys",
    "/webhooks",
    "/settings",
  ];

  const PUBLIC_ROUTES = ["/", "/login", "/verify"];

  const PUBLIC_API_PREFIXES = ["/docs", "/pricing", "/api/v1/tools", "/api/auth"];

  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => req.nextUrl.pathname === route || req.nextUrl.pathname.startsWith(route + "/"),
  );

  const isPublicRoute =
    PUBLIC_ROUTES.includes(req.nextUrl.pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => req.nextUrl.pathname.startsWith(prefix));

  if (!isPublicRoute && isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Apply CORS headers
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
