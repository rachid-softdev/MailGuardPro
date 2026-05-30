// API Route: Email validation
// GET /api/v1/validate?email=xxx

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasScope } from "@/lib/auth/require-scope";
import { hashApiKey, hashApiKeyLegacy } from "@/lib/crypto";
import { hashEmail } from "@/lib/emailHash";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { checkRateLimit } from "@/lib/redis";
import { getClientIp } from "@/lib/ssrf";
import { enforceTimingSafeResponse } from "@/lib/timingSafe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { checkDisposable } from "@/services/disposableChecker";
import { validateEmail } from "@/services/emailValidator";
import { checkFormat } from "@/services/formatChecker";

// Schema de validation
const validateQuerySchema = z.object({
  email: z.string().email().min(1).max(254),
});

// Helper pour extraire l'utilisateur (session ou API key)
async function getAuthenticatedUser(req: NextRequest) {
  // 1. Essayer avec la session
  const session = await auth();
  if (session?.user) {
    // Vérifier que l'utilisateur est actif
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true },
    });
    if (dbUser?.isActive === false) return null;
    return { type: "session", user: session.user };
  }

  // 2. Essayer avec l'API key
  const apiKey = req.headers.get("X-API-Key");
  // Minimum length check to reject obviously invalid keys early
  if (apiKey && apiKey.length < 8) return null;
  if (apiKey) {
    // Compute both hashes simultaneously to prevent timing oracle (VF-14)
    const [keyHash, legacyHash] = await Promise.all([hashApiKey(apiKey), hashApiKeyLegacy(apiKey)]);
    let keyRecord = await prisma.apiKey.findFirst({
      where: { OR: [{ keyHash }, { keyHash: legacyHash }] },
      include: { user: true },
    });

    // Migrate to new hash on access if using legacy hash
    if (keyRecord && keyRecord.keyHash === legacyHash) {
      await prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { keyHash },
      });
    }

    // Check for orphaned keys (deleted user)
    if (keyRecord && !keyRecord.user) return null;

    if (keyRecord?.isActive && keyRecord.user?.isActive) {
      if (!hasScope(keyRecord.scopes || "full", "validate")) {
        return null;
      }
      await prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      });
      return { type: "apiKey", user: keyRecord.user };
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    // Validation de l'email
    const validated = validateQuerySchema.safeParse({ email });
    if (!validated.success) {
      await enforceTimingSafeResponse(startTime);
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 });
    }

    // Authentification
    const authResult = await getAuthenticatedUser(req);
    const user = authResult?.user;

    // Si pas authentifié, rate limit STRICT (5 req/min/IP)
    if (!user) {
      const anonIp = getClientIp(req);
      const anonRateCheck = await checkRateLimit(`anon:validate:${anonIp}`, 5, 60);
      if (!anonRateCheck.success) {
        await enforceTimingSafeResponse(startTime);
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Authenticate for higher limits." },
          { status: 429 },
        );
      }

      // Retour rapide avec checks limités (format + disposable seulement)
      const formatCheck = checkFormat(email!);
      if (!formatCheck.passed) {
        await enforceTimingSafeResponse(startTime);
        return NextResponse.json({
          success: true,
          data: {
            email,
            score: 0,
            status: "invalid",
            checks: { format: formatCheck },
            processingTimeMs: Date.now() - startTime,
          },
          meta: { creditsUsed: 0, creditsRemaining: null },
        });
      }
      const disposableCheck = await checkDisposable(email!);
      await enforceTimingSafeResponse(startTime);
      return NextResponse.json({
        success: true,
        data: {
          email,
          score: disposableCheck.passed ? 50 : 0,
          status: disposableCheck.passed ? "unknown" : "invalid",
          checks: { format: formatCheck, disposable: disposableCheck },
          processingTimeMs: Date.now() - startTime,
        },
        meta: {
          creditsUsed: 0,
          creditsRemaining: null,
          note: "Full validation requires authentication",
        },
      });
    }

    // Rate limiting for authenticated users
    const userId = user.id;
    const plan = ((user as any).plan as Plan) || "FREE";
    const rateLimit = await checkRateLimitByPlan(userId, plan, "validate");
    if (!rateLimit.success) {
      await enforceTimingSafeResponse(startTime);
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded", retryAfter: rateLimit.resetAt },
        { status: 429 },
      );
    }

    // Quick pre-deduction gate: format + disposable checks
    // Don't charge users for emails that fail basic validation
    if (user) {
      const formatCheck = checkFormat(email!);
      if (!formatCheck.passed) {
        await enforceTimingSafeResponse(startTime);
        const remaining =
          (await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))
            ?.credits ?? null;
        const requestId = uuidv4();
        const processingTimeMs = Date.now() - startTime;
        return NextResponse.json({
          success: true,
          data: {
            email,
            score: 0,
            status: "invalid",
            checks: {
              format: formatCheck,
              mx: { passed: false, message: "Not checked", detail: "" },
              smtp: { passed: false, message: "Not checked", detail: "" },
              catchAll: { passed: false, message: "Not checked", detail: "" },
              disposable: { passed: false, message: "Not checked", detail: "" },
              generic: { passed: false, message: "Not checked", detail: "" },
              freeProvider: { passed: false, message: "Not checked", detail: "" },
              dnsbl: { passed: true, message: "Not checked", detail: "" },
              spf: { passed: false, message: "Not checked", detail: "" },
              dmarc: { passed: false, message: "Not checked", detail: "" },
              typo: { passed: true, message: "Not checked", detail: "" },
            },
            domain: { name: email!.split("@")[1] || "", reputation: "neutral" },
            processingTimeMs,
          },
          meta: { requestId, processingTimeMs, creditsUsed: 0, creditsRemaining: remaining },
        });
      }

      const disposableCheck = await checkDisposable(email!);
      if (!disposableCheck.passed) {
        await enforceTimingSafeResponse(startTime);
        const remaining =
          (await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))
            ?.credits ?? null;
        const requestId = uuidv4();
        const processingTimeMs = Date.now() - startTime;
        return NextResponse.json({
          success: true,
          data: {
            email,
            score: 0,
            status: "invalid",
            checks: {
              format: formatCheck,
              mx: { passed: false, message: "Not checked", detail: "" },
              smtp: { passed: false, message: "Not checked", detail: "" },
              catchAll: { passed: false, message: "Not checked", detail: "" },
              disposable: disposableCheck,
              generic: { passed: false, message: "Not checked", detail: "" },
              freeProvider: { passed: false, message: "Not checked", detail: "" },
              dnsbl: { passed: true, message: "Not checked", detail: "" },
              spf: { passed: false, message: "Not checked", detail: "" },
              dmarc: { passed: false, message: "Not checked", detail: "" },
              typo: { passed: true, message: "Not checked", detail: "" },
            },
            domain: { name: email!.split("@")[1] || "", reputation: "neutral" },
            processingTimeMs,
          },
          meta: { requestId, processingTimeMs, creditsUsed: 0, creditsRemaining: remaining },
        });
      }
    }

    // Deduct credits atomically for authenticated users
    if (user) {
      const deduction = await prisma.user.updateMany({
        where: {
          id: user.id,
          credits: { gte: 1 },
        },
        data: { credits: { decrement: 1 } },
      });

      if (deduction.count === 0) {
        await enforceTimingSafeResponse(startTime);
        return NextResponse.json(
          {
            success: false,
            error: "Insufficient credits",
            code: "INSUFFICIENT_CREDITS",
          },
          { status: 403 },
        );
      }
    }

    // Validation de l'email
    const result = await validateEmail(email!);

    // Save to DB if user is authenticated
    if (user) {
      await prisma.validation.create({
        data: {
          email: result.email, // Keep original for search compatibility
          emailHash: hashEmail(result.email), // Hash for privacy compliance
          score: result.score,
          status: result.status,
          checksJson: result.checks as any,
          processingTimeMs: result.processingTimeMs,
          userId: user.id,
        },
      });
    }

    // Get remaining credits after atomic deduction
    let creditsRemaining: number | null = null;
    if (user) {
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { credits: true },
      });
      creditsRemaining = updatedUser?.credits ?? null;
    }

    // Anti-enumeration: enforce timing-safe response with jitter to prevent
    // timing-based email enumeration attacks
    await enforceTimingSafeResponse(startTime);

    const requestId = uuidv4();
    const processingTimeMs = Date.now() - startTime;

    const response = NextResponse.json({
      success: true,
      data: result,
      meta: {
        requestId,
        processingTimeMs,
        creditsUsed: user ? 1 : 0,
        creditsRemaining,
      },
    });

    // HTTP cache - differs by user plan
    // Free/anonymous users: no cache (potentially dynamic data)
    // Premium users: short cache (5 min) with stale-while-revalidate
    if (user && plan && ["PRO", "BUSINESS"].includes(plan)) {
      // Premium: cache de 5 minutes avec stale-while-revalidate de 10 minutes
      response.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    } else {
      // Free or anonymous: very short cache (1 min)
      response.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    }

    // Vary on auth to differentiate responses by user
    response.headers.set("Vary", "X-API-Key, Cookie, Authorization");

    return response;
  } catch (error) {
    console.error("[API] Validate error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
