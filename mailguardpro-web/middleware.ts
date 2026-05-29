// NextAuth Middleware - Protection des routes + CSP with nonce

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https:`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
  ].join("; ");
}

export default auth((req) => {
  const nonce = generateNonce();
  const requestHeaders = new Headers(req.headers);

  const isLoggedIn = !!req.auth;

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
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
