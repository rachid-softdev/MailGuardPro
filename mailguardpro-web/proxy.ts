// Next.js 16 Proxy — edge runtime auth, CSP, CORS, rate limiting
// Replaces the deprecated middleware.ts convention.
// Only imports edge-safe modules — no Prisma, Redis, pino/crypto.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/auth-edge";
import { getCorsHeaders, handleCors } from "@/lib/cors";
import { loggerEdge } from "@/lib/logger-edge";
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
  const liveModeOrigins = process.env.NODE_ENV === "development" ? "http://localhost:8400" : "";
  // React uses eval() in development for debugging (e.g. reconstructing server stacks).
  // Next.js only requires it in dev; production never allows unsafe-eval.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval} ${stripeOrigins} ${liveModeOrigins}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https: ${imgOrigins}`,
    `font-src 'self' data:`,
    `connect-src 'self' https: ${sentryOrigins} ${liveModeOrigins}`,
    `frame-src 'self' ${frameOrigins}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export default async function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);

  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Coarse edge auth gate — DB-backed sessions cannot be validated in the Edge
  // Runtime, so only the presence of a session cookie is checked here (see
  // lib/auth-edge.ts). Full session validation is enforced server-side by
  // auth() in layouts and API routes.
  const isLoggedIn = hasSessionCookie(req);

  // Rate limiting for auth routes (20 req/min per IP)
  if (req.nextUrl.pathname.startsWith("/api/auth")) {
    const ip =
      requestHeaders.get("x-real-ip") ||
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateCheck = await checkMemoryRateLimit(`auth:${ip}`, 20, 60);
    if (!rateCheck.success) {
      loggerEdge.warn({ ip }, "Rate limited auth IP");
      return NextResponse.json(
        { error: "Too many requests", retryAfter: rateCheck.resetAt },
        { status: 429 },
      );
    }
  }

  const nonce = generateNonce();

  // Idempotency-Key: signal downstream rather than checking in edge (avoids Prisma/Redis)
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      // Pass the key downstream — API routes handle dedup with full Prisma/Redis
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

  // NOTE: an `isLoggedIn → redirect /login to /dashboard` shortcut is
  // intentionally absent: with a stale session cookie (expired/revoked in DB)
  // the dashboard layout redirects to /login which would then bounce back to
  // /dashboard, creating an infinite redirect loop.

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
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
