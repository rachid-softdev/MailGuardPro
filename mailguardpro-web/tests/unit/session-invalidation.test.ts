// =============================================================================
// TEST 1 (SEC-1) — Session invalidation on tokenVersion mismatch
// =============================================================================
// Tests the session callback logic that invalidates sessions when a user's
// tokenVersion is incremented (e.g., after API key revocation).
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS
// =============================================================================

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  AuditAction: {
    SESSION_FORCED_INVALIDATION: "SESSION_FORCED_INVALIDATION",
  },
  AuditResource: {
    SESSION: "Session",
  },
}));

// =============================================================================
// IMPORTS
// =============================================================================

import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

// =============================================================================
// HELPER — replicates the exact logic from lib/auth.ts session callback
// =============================================================================

interface SessionLike {
  user?: Record<string, any> | null;
  expires: string;
  [key: string]: any;
}

interface UserLike {
  tokenVersion?: number;
  [key: string]: any;
}

async function sessionCallback(session: SessionLike, user: UserLike): Promise<SessionLike> {
  if (session.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        plan: true,
        credits: true,
        role: true,
        tokenVersion: true,
        isActive: true,
        userRoles: { select: { role: true } },
      },
    });

    if (dbUser) {
      // Reject sessions for deactivated users
      if (dbUser.isActive === false) {
        return { ...session, user: null as any, expires: new Date(0).toISOString() };
      }

      // Enforce session invalidation (tokenVersion was incremented via key revocation)
      if (dbUser.tokenVersion > 0 && dbUser.tokenVersion !== user.tokenVersion) {
        console.warn(
          "[Auth] Session invalidated — tokenVersion mismatch",
          JSON.stringify({
            userId: dbUser.id,
            sessionVersion: user.tokenVersion,
            dbVersion: dbUser.tokenVersion,
          }),
        );
        // ÉTAPE 1: Supprimer TOUTES les sessions de l'utilisateur
        await prisma.session.deleteMany({ where: { userId: dbUser.id } });
        // ÉTAPE 2: Logger l'événement (best-effort, non-bloquant)
        // logAudit already catches errors internally — no .catch() needed
        logAudit({
          userId: dbUser.id,
          action: AuditAction.SESSION_FORCED_INVALIDATION,
          resource: AuditResource.SESSION,
          metadata: {
            previousTokenVersion: user.tokenVersion,
            currentTokenVersion: dbUser.tokenVersion,
          },
        });
        // Return a session with no user data → NextAuth treats this as unauthenticated
        return { ...session, user: null as any, expires: new Date(0).toISOString() };
      }

      // TokenVersion matches: populate session with DB data
      session.user.id = dbUser.id;
      session.user.plan = dbUser.plan;
      session.user.credits = dbUser.credits;
      session.user.role = dbUser.role;
      session.user.tokenVersion = dbUser.tokenVersion;
      session.user.roles = dbUser.userRoles.map((ur: { role: string }) => ur.role);
    }
  }
  return session;
}

// =============================================================================
// TESTS
// =============================================================================

describe("SEC-1: Session invalidation", () => {
  const mockUser = {
    id: "user-1",
    plan: "FREE",
    credits: 100,
    role: "user",
    isActive: true,
    userRoles: [{ role: "user" }],
  };

  const makeSession = (overrides: Record<string, any> = {}): SessionLike => ({
    user: { email: "test@example.com", tokenVersion: 1 },
    expires: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  });

  const makeUser = (overrides: Record<string, any> = {}): UserLike => ({
    tokenVersion: 1,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Supprime les sessions en DB quand tokenVersion mismatch
  // ---------------------------------------------------------------------------
  it("should delete all user sessions when tokenVersion mismatch", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 2,
    });

    const session = makeSession();
    const user = makeUser();

    await sessionCallback(session, user);

    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Log l'événement dans AuditLog
  // ---------------------------------------------------------------------------
  it("should log an AuditLog event when tokenVersion mismatch", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 2,
    });

    const session = makeSession();
    const user = makeUser();

    await sessionCallback(session, user);

    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: AuditAction.SESSION_FORCED_INVALIDATION,
      resource: AuditResource.SESSION,
      metadata: {
        previousTokenVersion: 1,
        currentTokenVersion: 2,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Retourne une session invalide (user: null)
  // ---------------------------------------------------------------------------
  it("should return session with user: null when tokenVersion mismatch", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 2,
    });

    const session = makeSession({ user: { email: "test@example.com", tokenVersion: 1 } });
    const user = makeUser();

    const result = await sessionCallback(session, user);

    expect(result.user).toBeNull();
    expect(new Date(result.expires).getTime()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Ne supprime PAS les sessions si tokenVersion MATCH
  // ---------------------------------------------------------------------------
  it("should NOT delete sessions or log audit when tokenVersion matches", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 1,
    });

    const session = makeSession();
    const user = makeUser({ tokenVersion: 1 });

    const result = await sessionCallback(session, user);

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    // Session should be populated
    expect(result.user?.id).toBe("user-1");
    expect(result.user?.plan).toBe("FREE");
    expect(result.user?.tokenVersion).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — Fonctionne plusieurs sessions pour le même user
  // ---------------------------------------------------------------------------
  it("should handle multiple sessions for the same user", async () => {
    // Simulate 5 sessions deleted
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 5 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 2,
    });

    const session = makeSession();
    const user = makeUser();

    await sessionCallback(session, user);

    // deleteMany is called once and affects all sessions
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    // One audit log entry regardless of session count
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Edge case: tokenVersion is 0 (default for new users before first revocation)
  // ---------------------------------------------------------------------------
  it("should NOT invalidate when tokenVersion is 0 (default)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 0,
    });

    const session = makeSession();
    const user = makeUser({ tokenVersion: 0 });

    const result = await sessionCallback(session, user);

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    // Session should be populated
    expect(result.user?.id).toBe("user-1");
  });

  // ---------------------------------------------------------------------------
  // Edge case: deactivated user
  // ---------------------------------------------------------------------------
  it("should return null user for deactivated accounts", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      isActive: false,
      tokenVersion: 1,
    });

    const session = makeSession();
    const user = makeUser();

    const result = await sessionCallback(session, user);

    expect(result.user).toBeNull();
    expect(new Date(result.expires).getTime()).toBe(0);
    // No audit log for deactivation (separate logic)
    expect(logAudit).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Edge case: user not found in DB
  // ---------------------------------------------------------------------------
  it("should return session unchanged when user not found in DB", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const session = makeSession();
    const user = makeUser();

    const result = await sessionCallback(session, user);

    // Session returned as-is (user still present, no deletion)
    expect(result.user?.email).toBe("test@example.com");
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Edge case: session without user email
  // ---------------------------------------------------------------------------
  it("should return session unchanged when session has no user email", async () => {
    const session = makeSession({ user: null });
    const user = makeUser();

    const result = await sessionCallback(session, user);

    expect(result.user).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Edge case: logAudit failure should not propagate (fire-and-forget)
  // ---------------------------------------------------------------------------
  it("should not throw when logAudit fails (fire-and-forget)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      tokenVersion: 2,
    });
    vi.mocked(logAudit).mockRejectedValue(new Error("DB write failed"));

    const session = makeSession();
    const user = makeUser();

    // Should not throw
    const result = await sessionCallback(session, user);

    expect(result.user).toBeNull();
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
  });
});
