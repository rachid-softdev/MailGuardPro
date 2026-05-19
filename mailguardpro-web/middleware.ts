// NextAuth Middleware - Protection des routes

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnValidate = req.nextUrl.pathname.startsWith("/validate");
  const isOnBulk = req.nextUrl.pathname.startsWith("/bulk");
  const isOnApiKeys = req.nextUrl.pathname.startsWith("/api-keys");
  const isOnWebhooks = req.nextUrl.pathname.startsWith("/webhooks");
  const isOnSettings = req.nextUrl.pathname.startsWith("/settings");

  // Routes publiques qui ne nécessitent pas d'auth
  const isPublicRoute =
    req.nextUrl.pathname === "/" ||
    req.nextUrl.pathname === "/login" ||
    req.nextUrl.pathname === "/verify" ||
    req.nextUrl.pathname.startsWith("/docs") ||
    req.nextUrl.pathname.startsWith("/pricing") ||
    req.nextUrl.pathname.startsWith("/api/v1/tools") ||
    req.nextUrl.pathname.startsWith("/api/auth");

  if (
    !isPublicRoute &&
    (isOnDashboard || isOnValidate || isOnBulk || isOnApiKeys || isOnWebhooks || isOnSettings)
  ) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rediriger vers dashboard si déjà connecté et sur login
  if (isLoggedIn && (req.nextUrl.pathname === "/login" || req.nextUrl.pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
