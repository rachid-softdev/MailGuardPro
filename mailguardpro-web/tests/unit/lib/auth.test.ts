// =============================================================================
// Auth Module (NextAuth v5) — Comprehensive Unit Tests
//
// Tests all callbacks and events defined in lib/auth.ts by intercepting the
// NextAuth configuration object via module mocking.  Covers:
//   - signIn callback   (magic link rate limiting, IP rate limiting, audit)
//   - session callback  (DB enrichment, deactivation, tokenVersion invalidation)
//   - JWT callback      (user id passthrough)
//   - events.createUser (free 100 credits)
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock setup
// ---------------------------------------------------------------------------
// These must be defined BEFORE vi.mock() calls because vitest hoists the
// factory functions to the top of the file but cannot capture variables
// defined outside vi.hoisted().

const mockLogAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockPrismaFindUnique = vi.hoisted(() => vi.fn());
const mockPrismaUpdate = vi.hoisted(() => vi.fn());
const mockPrismaDeleteMany = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockValidateAuthSecret = vi.hoisted(() => vi.fn(() => ({ valid: true, message: "" })));
const mockLoggerAuthWarn = vi.hoisted(() => vi.fn());
const mockLoggerAuthError = vi.hoisted(() => vi.fn());

// Captures the NextAuth configuration so tests can invoke callbacks directly
// NOTE: Must use vi.hoisted so the objects exist before vi.mock factories run.
const capturedCallbacks = vi.hoisted(() => ({}) as Record<string, any>);
const capturedEvents = vi.hoisted(() => ({}) as Record<string, any>);

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  __esModule: true,
  default: vi.fn((config: any) => {
    // Use Object.assign to mutate (not reassign) the hoisted objects
    Object.assign(capturedCallbacks, config.callbacks || {});
    Object.assign(capturedEvents, config.events || {});
    return {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));

vi.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: vi.fn(() => ({ id: "google", name: "Google", type: "oauth" })),
}));

vi.mock("next-auth/providers/resend", () => ({
  __esModule: true,
  default: vi.fn(() => ({ id: "resend", name: "Resend", type: "email" })),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockPrismaFindUnique,
      update: mockPrismaUpdate,
    },
    session: {
      deleteMany: mockPrismaDeleteMany,
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: mockRedisSet,
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
  },
}));

vi.mock("@/services/auditLogger", () => ({
  logAudit: mockLogAudit,
  AuditAction: {
    USER_LOGIN: "USER_LOGIN",
    USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
    SESSION_FORCED_INVALIDATION: "SESSION_FORCED_INVALIDATION",
  },
  AuditResource: {
    USER: "User",
    SESSION: "Session",
  },
}));

vi.mock("@/lib/authSecretValidator", () => ({
  validateAuthSecret: mockValidateAuthSecret,
}));

vi.mock("@/lib/logger", () => ({
  loggerAuth: {
    warn: mockLoggerAuthWarn,
    error: mockLoggerAuthError,
    info: vi.fn(),
  },
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------
// This triggers module-level evaluation which calls NextAuth(config), thereby
// populating capturedCallbacks and capturedEvents.

import { auth, handlers, signIn, signOut } from "@/lib/auth";

// Extract callbacks for direct invocation in tests
const signInCallback = capturedCallbacks.signIn as (...args: any[]) => any;
const sessionCallback = capturedCallbacks.session as (...args: any[]) => any;
const jwtCallback = capturedCallbacks.jwt as (...args: any[]) => any;
const createUserEvent = capturedEvents.createUser as (...args: any[]) => any;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("NextAuth configuration (lib/auth.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Redis permits the request
    mockRedisSet.mockResolvedValue("OK");
  });

  // ==========================================================================
  // Basic export tests
  // ==========================================================================

  describe("exports", () => {
    it("should export handlers with GET and POST", () => {
      expect(handlers).toBeDefined();
      expect(handlers.GET).toBeInstanceOf(Function);
      expect(handlers.POST).toBeInstanceOf(Function);
    });

    it("should export auth as a function", () => {
      expect(typeof auth).toBe("function");
    });

    it("should export signIn as a function", () => {
      expect(typeof signIn).toBe("function");
    });

    it("should export signOut as a function", () => {
      expect(typeof signOut).toBe("function");
    });
  });

  // ==========================================================================
  // signIn callback — magic-link rate limiting, IP rate limiting, audit logging
  // ==========================================================================

  describe("signIn callback", () => {
    // Standard params for a Resend magic-link sign-in attempt
    const magicLinkParams = {
      user: { id: "user-1", email: "test@example.com", emailVerified: null },
      account: { provider: "resend", type: "email" },
      email: { address: "test@example.com", verificationRequest: true },
      req: {
        headers: {
          get: (name: string) => {
            if (name === "x-forwarded-for") return "203.0.113.42";
            return null;
          },
        },
      },
    };

    // -----------------------------------------------------------------------
    // Magic-link rate limiting (FIX #18)
    // -----------------------------------------------------------------------

    it("should return true when magic link rate limit is NOT exceeded", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith("magiclink:test@example.com", "1", "EX", 60, "NX");
    });

    it("should return false when magic link rate limit IS exceeded (SET NX returns null)", async () => {
      mockRedisSet.mockResolvedValueOnce(null);
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(false);
      expect(mockLoggerAuthWarn).toHaveBeenCalledWith("Magic link rate limited");
    });

    it("should handle Redis error gracefully and allow the magic link request", async () => {
      mockRedisSet.mockRejectedValue(new Error("Redis connection refused"));
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(true);
      expect(mockLoggerAuthWarn).toHaveBeenCalledWith(
        "Redis unavailable for magic link rate limit",
      );
    });

    // -----------------------------------------------------------------------
    // IP-based rate limiting
    // -----------------------------------------------------------------------

    it("should return true when IP rate limit is NOT exceeded", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(true);
    });

    it("should return false when IP rate limit IS exceeded", async () => {
      mockRedisSet
        .mockResolvedValueOnce("OK") // email key: acquired
        .mockResolvedValueOnce(null); // IP key: already exists → rate limited
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(false);
      expect(mockLoggerAuthWarn).toHaveBeenCalledWith(
        { ip: "203.0.113.42" },
        "Magic link IP rate limited",
      );
    });

    it("should extract the first IP from x-forwarded-for (comma-separated list)", async () => {
      const params = {
        ...magicLinkParams,
        req: {
          headers: {
            get: (name: string) => {
              // Typical proxy chain: client, proxy1, proxy2
              if (name === "x-forwarded-for") return "192.168.1.100, 10.0.0.1, 172.16.0.1";
              return null;
            },
          },
        },
      };
      mockRedisSet.mockResolvedValueOnce("OK").mockResolvedValueOnce("OK");
      const result = await signInCallback(params);
      expect(result).toBe(true);
      // IP lock should use only the first (client) IP
      expect(mockRedisSet).toHaveBeenNthCalledWith(
        2,
        "magiclink:ip:192.168.1.100",
        "1",
        "EX",
        10,
        "NX",
      );
    });

    it("should fall back to x-real-ip when x-forwarded-for is absent", async () => {
      const params = {
        ...magicLinkParams,
        req: {
          headers: {
            get: (name: string) => {
              if (name === "x-real-ip") return "10.0.0.5";
              return null;
            },
          },
        },
      };
      mockRedisSet.mockResolvedValueOnce("OK").mockResolvedValueOnce("OK");
      await signInCallback(params);
      expect(mockRedisSet).toHaveBeenNthCalledWith(2, "magiclink:ip:10.0.0.5", "1", "EX", 10, "NX");
    });

    it("should use 'unknown' when no IP header is present at all", async () => {
      const params = {
        ...magicLinkParams,
        req: {
          headers: {
            get: () => null,
          },
        },
      };
      mockRedisSet.mockResolvedValueOnce("OK").mockResolvedValueOnce("OK");
      await signInCallback(params);
      expect(mockRedisSet).toHaveBeenNthCalledWith(2, "magiclink:ip:unknown", "1", "EX", 10, "NX");
    });

    it("should handle Redis error for IP rate limit gracefully and allow the request", async () => {
      mockRedisSet
        .mockResolvedValueOnce("OK") // email key succeeds
        .mockRejectedValueOnce(new Error("Redis timeout")); // IP key fails
      const result = await signInCallback(magicLinkParams);
      expect(result).toBe(true);
      expect(mockLoggerAuthWarn).toHaveBeenCalledWith(
        "Redis unavailable for magic link IP rate limit",
      );
    });

    it("should skip ALL Redis rate limiting for non-resend providers (e.g. Google)", async () => {
      const googleParams = {
        user: { id: "user-2", email: "google@example.com", emailVerified: new Date() },
        account: { provider: "google", type: "oauth" },
        req: { headers: { get: () => null } },
      };
      const result = await signInCallback(googleParams);
      expect(result).toBe(true);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Successful login audit logging
    // -----------------------------------------------------------------------

    it("should call auditLogger with USER_LOGIN on successful resend login", async () => {
      mockRedisSet.mockResolvedValue("OK");
      await signInCallback(magicLinkParams);
      expect(mockLogAudit).toHaveBeenCalledWith({
        userId: "user-1",
        action: "USER_LOGIN",
        resource: "User",
        metadata: { provider: "resend" },
      });
    });

    it("should call auditLogger with USER_LOGIN on successful google login", async () => {
      const googleParams = {
        user: { id: "user-2", email: "google@example.com" },
        account: { provider: "google", type: "oauth" },
        req: { headers: { get: () => null } },
      };
      await signInCallback(googleParams);
      expect(mockLogAudit).toHaveBeenCalledWith({
        userId: "user-2",
        action: "USER_LOGIN",
        resource: "User",
        metadata: { provider: "google" },
      });
    });

    it("should NOT call auditLogger for providers other than resend/google", async () => {
      const params = {
        user: { id: "user-3" },
        account: { provider: "credentials", type: "credentials" },
        req: { headers: { get: () => null } },
      };
      const result = await signInCallback(params);
      expect(result).toBe(true);
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    it("should handle auditLogger error non-fatally on successful login", async () => {
      mockLogAudit.mockRejectedValueOnce(new Error("DB write failed"));
      mockRedisSet.mockResolvedValue("OK");
      // Should not throw — the catch block swallows the error
      await expect(signInCallback(magicLinkParams)).resolves.toBe(true);
    });

    // -----------------------------------------------------------------------
    // Failed login audit logging
    // -----------------------------------------------------------------------

    it("should call auditLogger with USER_LOGIN_FAILED when user is null", async () => {
      const params = {
        user: null,
        account: { provider: "resend", type: "email" },
        req: { headers: { get: () => null } },
      };
      const result = await signInCallback(params);
      expect(result).toBe(false);
      expect(mockLogAudit).toHaveBeenCalledWith({
        action: "USER_LOGIN_FAILED",
        resource: "User",
        metadata: { provider: "resend" },
      });
    });

    it("should use 'unknown' as provider in failure audit when account is null", async () => {
      const params = {
        user: null,
        account: null,
        req: { headers: { get: () => null } },
      };
      const result = await signInCallback(params);
      expect(result).toBe(false);
      expect(mockLogAudit).toHaveBeenCalledWith({
        action: "USER_LOGIN_FAILED",
        resource: "User",
        metadata: { provider: "unknown" },
      });
    });

    it("should log and swallow auditLogger error on login failure", async () => {
      mockLogAudit.mockRejectedValueOnce(new Error("Audit DB insert failed"));
      const params = {
        user: null,
        account: { provider: "resend" },
        req: { headers: { get: () => null } },
      };
      const result = await signInCallback(params);
      expect(result).toBe(false);
      expect(mockLoggerAuthError).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        "Failed to log login failure",
      );
    });
  });

  // ==========================================================================
  // session callback — DB enrichment, deactivation, tokenVersion invalidation
  // ==========================================================================

  describe("session callback", () => {
    const baseSession = {
      user: { name: "Test User", email: "test@example.com", image: null },
      expires: "2099-01-01T00:00:00.000Z",
    };

    const adapterUser = {
      id: "adapter-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: new Date(),
      image: null,
      tokenVersion: 1,
    };

    const defaultDbUser = {
      id: "db-user-1",
      plan: "premium",
      credits: 500,
      role: "ADMIN",
      tokenVersion: 1,
      isActive: true,
      userRoles: [{ role: "ADMIN" }],
    };

    // -----------------------------------------------------------------------
    // Happy path — session enriched from DB
    // -----------------------------------------------------------------------

    it("should enrich session with user data from DB (id, plan, credits, role, tokenVersion, roles)", async () => {
      mockPrismaFindUnique.mockResolvedValue(defaultDbUser);
      const result = await sessionCallback({ session: baseSession, user: adapterUser });

      expect(result).not.toBeNull();
      expect(result?.user).not.toBeNull();
      expect(result?.user?.id).toBe("db-user-1");
      expect(result?.user?.plan).toBe("premium");
      expect(result?.user?.credits).toBe(500);
      expect(result?.user?.role).toBe("ADMIN");
      expect(result?.user?.tokenVersion).toBe(1);
      expect(result?.user?.roles).toEqual(["ADMIN"]);

      // Original session properties preserved
      expect(result?.user?.name).toBe("Test User");
      expect(result?.user?.email).toBe("test@example.com");
    });

    it("should map userRoles to string array in session.roles", async () => {
      const multiRoleUser = {
        ...defaultDbUser,
        userRoles: [{ role: "ADMIN" }, { role: "USER" }],
      };
      mockPrismaFindUnique.mockResolvedValue(multiRoleUser);
      const result = await sessionCallback({ session: baseSession, user: adapterUser });
      expect(result?.user?.roles).toEqual(["ADMIN", "USER"]);
    });

    // -----------------------------------------------------------------------
    // Deactivated user
    // -----------------------------------------------------------------------

    it("should return session with null user when user is deactivated (isActive=false)", async () => {
      mockPrismaFindUnique.mockResolvedValue({ ...defaultDbUser, isActive: false });
      const result = await sessionCallback({ session: baseSession, user: adapterUser });
      // user must be null, NOT undefined
      expect(result?.user).toBeNull();
      expect(result.user).toBeNull();
      expect(result.user === null).toBe(true);
      expect(result.expires).toBe(new Date(0).toISOString());
    });

    // -----------------------------------------------------------------------
    // tokenVersion-based session invalidation
    // -----------------------------------------------------------------------

    it("should return null user & delete sessions & log audit when tokenVersion mismatches (db>session)", async () => {
      mockPrismaFindUnique.mockResolvedValue({ ...defaultDbUser, tokenVersion: 3 });
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 1 },
      });

      // Session is invalidated
      expect(result?.user).toBeNull();
      expect(result?.expires).toBe(new Date(0).toISOString());

      // All user sessions deleted
      expect(mockPrismaDeleteMany).toHaveBeenCalledWith({ where: { userId: "db-user-1" } });

      // Audit event logged
      expect(mockLogAudit).toHaveBeenCalledWith({
        userId: "db-user-1",
        action: "SESSION_FORCED_INVALIDATION",
        resource: "Session",
        metadata: {
          previousTokenVersion: 1,
          currentTokenVersion: 3,
        },
      });
    });

    it("should pass through when tokenVersion matches", async () => {
      mockPrismaFindUnique.mockResolvedValue(defaultDbUser); // tokenVersion: 1
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 1 },
      });
      expect(result?.user?.id).toBe("db-user-1");
      expect(result?.user?.tokenVersion).toBe(1);
    });

    it("should NOT invalidate session when dbUser.tokenVersion is null", async () => {
      mockPrismaFindUnique.mockResolvedValue({
        ...defaultDbUser,
        tokenVersion: null,
        userRoles: [{ role: "USER" }],
      });
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 1 },
      });
      // null > 0 is false → branch skipped, user data still enriched
      expect(result?.user?.id).toBe("db-user-1");
      expect(mockPrismaDeleteMany).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "SESSION_FORCED_INVALIDATION" }),
      );
    });

    it("should NOT invalidate session when dbUser.tokenVersion is undefined", async () => {
      const dbUserWithoutTokenVersion = { ...defaultDbUser, userRoles: [{ role: "USER" }] };
      delete dbUserWithoutTokenVersion.tokenVersion;
      mockPrismaFindUnique.mockResolvedValue(dbUserWithoutTokenVersion);
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 1 },
      });
      // undefined > 0 is false → branch skipped
      expect(result?.user?.id).toBe("db-user-1");
      expect(mockPrismaDeleteMany).not.toHaveBeenCalled();
    });

    it("should NOT invalidate session when db tokenVersion is 0 (default)", async () => {
      mockPrismaFindUnique.mockResolvedValue({
        ...defaultDbUser,
        tokenVersion: 0,
        userRoles: [{ role: "USER" }],
      });
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 0 },
      });
      // 0 > 0 is false → branch skipped
      expect(result?.user?.id).toBe("db-user-1");
      expect(mockPrismaDeleteMany).not.toHaveBeenCalled();
      expect(mockLogAudit).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "SESSION_FORCED_INVALIDATION" }),
      );
    });

    it("should handle audit log error during session invalidation non-fatally", async () => {
      mockLogAudit.mockRejectedValueOnce(new Error("Audit log error"));
      mockPrismaFindUnique.mockResolvedValue({ ...defaultDbUser, tokenVersion: 99 });
      const result = await sessionCallback({
        session: baseSession,
        user: { ...adapterUser, tokenVersion: 1 },
      });
      // Session should still be invalidated even if audit fails
      expect(result?.user).toBeNull();
      expect(mockPrismaDeleteMany).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // User not found / missing email
    // -----------------------------------------------------------------------

    it("should return session unchanged when user is not found in DB", async () => {
      mockPrismaFindUnique.mockResolvedValue(null);
      const result = await sessionCallback({ session: baseSession, user: adapterUser });
      expect(result).toEqual(baseSession);
    });

    it("should return session unchanged when session.user.email is null", async () => {
      const sessionNoEmail = {
        user: { name: "No Email", email: null, image: null },
        expires: "2099-01-01T00:00:00.000Z",
      };
      const result = await sessionCallback({ session: sessionNoEmail, user: adapterUser });
      expect(result).toEqual(sessionNoEmail);
      expect(mockPrismaFindUnique).not.toHaveBeenCalled();
    });

    it("should return session unchanged when session.user is undefined", async () => {
      const sessionNoUser = { expires: "2099-01-01T00:00:00.000Z" };
      const result = await sessionCallback({ session: sessionNoUser, user: adapterUser });
      expect(result).toEqual(sessionNoUser);
      expect(mockPrismaFindUnique).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // JWT callback — pass user id to token
  // ==========================================================================

  describe("JWT callback", () => {
    it("should set token.id from user.id when user is provided", async () => {
      const token = {};
      const user = { id: "user-42" };
      const result = await jwtCallback({ token, user });
      expect(result.id).toBe("user-42");
    });

    it("should return token unchanged when user is not provided", async () => {
      const token = { name: "Test User", email: "test@example.com" };
      const result = await jwtCallback({ token });
      expect(result).toEqual(token);
      expect(result.id).toBeUndefined();
    });

    it("should preserve existing token properties when user is provided", async () => {
      const token = { name: "Existing", email: "existing@example.com" };
      const user = { id: "new-id" };
      const result = await jwtCallback({ token, user });
      expect(result.id).toBe("new-id");
      expect(result.name).toBe("Existing");
      expect(result.email).toBe("existing@example.com");
    });
  });

  // ==========================================================================
  // events.createUser — grant 100 free credits
  // ==========================================================================

  describe("events.createUser", () => {
    it("should grant 100 credits to a new user via prisma.user.update", async () => {
      await createUserEvent({ user: { id: "new-user-id" } });
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: "new-user-id" },
        data: { credits: 100 },
      });
    });

    it("should NOT update credits when user has no id", async () => {
      await createUserEvent({ user: {} });
      expect(mockPrismaUpdate).not.toHaveBeenCalled();
    });

    it("should NOT update credits when user is null/undefined", async () => {
      await createUserEvent({ user: null });
      expect(mockPrismaUpdate).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Configuration sanity checks
  // ==========================================================================

  describe("configuration", () => {
    it("should have captured callbacks and events from NextAuth config", () => {
      expect(capturedCallbacks).toHaveProperty("signIn");
      expect(capturedCallbacks).toHaveProperty("session");
      expect(capturedCallbacks).toHaveProperty("jwt");
      expect(capturedEvents).toHaveProperty("createUser");
    });

    // Note: validateAuthSecret IS called at module load time and returned
    // { valid: true }. We cannot assert on mock calls here because
    // beforeEach -> vi.clearAllMocks() clears call counts before every test.
    // The successful module import proves validation passed.
  });

  // ==========================================================================
  // Module-level validateAuthSecret check — must be LAST because it uses
  // vi.reloadModules() and dynamic import to re-evaluate module-level code.
  // ==========================================================================

  describe("module-level validateAuthSecret check", () => {
    it("should throw in production when validateAuthSecret returns invalid", async () => {
      vi.stubEnv("NODE_ENV", "production");
      mockValidateAuthSecret.mockReturnValue({ valid: false, message: "Bad auth secret" });

      vi.resetModules();
      await expect(() => import("@/lib/auth")).rejects.toThrow(
        "Startup validation failed: Bad auth secret",
      );

      // Restore for remaining tests
      mockValidateAuthSecret.mockReturnValue({ valid: true, message: "" });
      vi.unstubAllEnvs();
      vi.resetModules();
      await import("@/lib/auth");
    });

    it("should NOT throw in dev when validateAuthSecret returns invalid (only log)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      mockValidateAuthSecret.mockReturnValue({ valid: false, message: "Bad dev secret" });

      vi.resetModules();
      // Should not throw
      await expect(import("@/lib/auth")).resolves.toBeDefined();

      // Should log the error
      expect(mockLoggerAuthError).toHaveBeenCalledWith(
        { msg: "Bad dev secret" },
        "Auth secret validation failed",
      );

      // Restore for remaining tests
      mockValidateAuthSecret.mockReturnValue({ valid: true, message: "" });
      vi.unstubAllEnvs();
      vi.resetModules();
      await import("@/lib/auth");
    });
  });
});
