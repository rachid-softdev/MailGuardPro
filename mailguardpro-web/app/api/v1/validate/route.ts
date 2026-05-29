// API Route: Email validation
// GET /api/v1/validate?email=xxx

import { auth } from "@/lib/auth";
import { hasScope } from "@/lib/auth/require-scope";
import { hashApiKey, hashApiKeyLegacy } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { type Plan, checkRateLimitByPlan } from "@/lib/rateLimits";
import { getClientIp } from "@/lib/ssrf";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { checkDisposable } from "@/services/disposableChecker";
import { validateEmail } from "@/services/emailValidator";
import { checkFormat } from "@/services/formatChecker";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

// Schema de validation
const validateQuerySchema = z.object({
  email: z.string().email().min(1).max(254),
});

// Helper pour extraire l'utilisateur (session ou API key)
async function getAuthenticatedUser(req: NextRequest) {
  // 1. Essayer avec la session
  const session = await auth();
  if (session?.user) {
    return { type: "session", user: session.user };
  }

  // 2. Essayer avec l'API key
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey) {
    // Try new HMAC-peppered hash first, then fall back to legacy SHA256
    const keyHash = hashApiKey(apiKey);
    let keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!keyRecord) {
      const legacyHash = hashApiKeyLegacy(apiKey);
      keyRecord = await prisma.apiKey.findUnique({
        where: { keyHash: legacyHash },
        include: { user: true },
      });
      // Migrate to new hash on access
      if (keyRecord) {
        await prisma.apiKey.update({
          where: { id: keyRecord.id },
          data: { keyHash },
        });
      }
    }

    if (keyRecord?.isActive) {
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
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    // Validation de l'email
    const validated = validateQuerySchema.safeParse({ email });
    if (!validated.success) {
      return NextResponse.json({ success: false, error: "Invalid email format" }, { status: 400 });
    }

    // Authentification
    const authResult = await getAuthenticatedUser(req);
    const user = authResult?.user;

    // Rate limiting based on plan or IP
    const userId = user?.id || getClientIp(req);
    const plan = (user?.plan as Plan) || "FREE";
    const rateLimit = await checkRateLimitByPlan(userId, plan, "validate");
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded",
          retryAfter: rateLimit.resetAt,
        },
        { status: 429 },
      );
    }

    // Quick pre-deduction gate: format + disposable checks
    // Don't charge users for emails that fail basic validation
    const startTime = Date.now();
    if (user) {
      const formatCheck = checkFormat(email!);
      if (!formatCheck.passed) {
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
        return NextResponse.json(
          {
            success: false,
            error: "Insufficient credits",
            code: "INSUFFICIENT_CREDITS",
          },
          { status: 402 },
        );
      }
    }

    // Validation de l'email
    const result = await validateEmail(email!);

    // Save to DB if user is authenticated
    if (user) {
      await prisma.validation.create({
        data: {
          email: result.email,
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

    // Response
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
