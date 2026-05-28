// API Route: Email validation
// GET /api/v1/validate?email=xxx

import { auth } from "@/lib/auth";
import { hashApiKey, hashApiKeyLegacy } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { getClientIp } from "@/lib/ssrf";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { validateEmail } from "@/services/emailValidator";
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

    // Rate limiting: single check based on authentication level
    let rateLimitKey: string;
    let rateLimitMax: number;
    let userPlan: string | null = null;

    if (user && user.plan) {
      // Plan-based limits
      const planLimits: Record<string, number> = {
        FREE: 20,
        STARTER: 100,
        PRO: 500,
        BUSINESS: 2000,
      };
      userPlan = user.plan as string;
      rateLimitKey = `user:${user.id}`;
      rateLimitMax = planLimits[userPlan] || 20;
    } else if (user) {
      // Authenticated but plan not available in session — fetch from DB
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { plan: true },
      });
      userPlan = dbUser?.plan ?? "FREE";
      rateLimitKey = `user:${user.id}`;
      rateLimitMax =
        userPlan === "STARTER"
          ? 100
          : userPlan === "PRO"
            ? 500
            : userPlan === "BUSINESS"
              ? 2000
              : 20;
    } else {
      // Anonymous: IP-based, strict limit
      const ip = getClientIp(req);
      rateLimitKey = `ip:${ip}`;
      rateLimitMax = 10;
    }

    const rateLimit = await checkRateLimit(rateLimitKey, rateLimitMax, 60);
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
    const startTime = Date.now();
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
    if (user && userPlan && ["PRO", "BUSINESS"].includes(userPlan)) {
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
