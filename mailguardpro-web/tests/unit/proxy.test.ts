// Regression tests for the Edge proxy auth gate (DB-session cookie presence).
//
// Bug: the proxy used next-auth/jwt `getToken()` (JWT decoding) while the app
// uses database sessions (`session.strategy = "database"`), so every request
// with a valid session was treated as unauthenticated and redirected to /login.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "@/lib/auth-edge";
import proxy from "@/proxy";

const SESSION_COOKIE = "next-auth.session-token=abcdef0123456789";

function makeRequest(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("hasSessionCookie", () => {
  it("detects the configured next-auth.session-token cookie", () => {
    expect(hasSessionCookie(makeRequest("/", SESSION_COOKIE))).toBe(true);
  });

  it("detects the __Secure- prefixed variant", () => {
    expect(hasSessionCookie(makeRequest("/", "__Secure-next-auth.session-token=abc"))).toBe(true);
  });

  it("detects the session cookie among other cookies and whitespace", () => {
    expect(hasSessionCookie(makeRequest("/", `theme=dark; ${SESSION_COOKIE}; other=1`))).toBe(true);
  });

  it("does not match similarly-named cookies", () => {
    expect(hasSessionCookie(makeRequest("/", "not-next-auth.session-token=abc"))).toBe(false);
    expect(hasSessionCookie(makeRequest("/", "next-auth.session-token-other=abc"))).toBe(false);
  });

  it("returns false when no cookie header is present", () => {
    expect(hasSessionCookie(makeRequest("/"))).toBe(false);
  });
});

describe("proxy auth gate (DB session cookie presence)", () => {
  it("redirects protected routes to /login without a session cookie", async () => {
    const response = await proxy(makeRequest("/dashboard"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=");
  });

  it("lets protected routes through when a session cookie is present", async () => {
    const response = await proxy(makeRequest("/dashboard", SESSION_COOKIE));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect /login when a session cookie is present (no redirect loop)", async () => {
    const response = await proxy(makeRequest("/login", SESSION_COOKIE));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps public routes accessible without a session cookie", async () => {
    const response = await proxy(makeRequest("/"));
    expect(response.status).toBe(200);
  });
});
