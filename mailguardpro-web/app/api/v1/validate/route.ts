// API Route: Validation email unitaire
// GET /api/v1/validate?email=xxx

import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
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
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

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

    // Rate limiting par IP
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rateLimit = await checkRateLimit(`ip:${ip}`, 20, 60); // 20 req/min

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

    // Authentification
    const authResult = await getAuthenticatedUser(req);
    const user = authResult?.user;

    // Récupérer les infos utilisateur pour le plan et rate limiting
    let userPlan: string | null = null;
    if (user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { plan: true },
      });
      userPlan = dbUser?.plan ?? null;

      // Rate limiting par utilisateur (doit être AVANT la déduction de crédits)
      const userRateLimit = await checkRateLimit(`user:${user.id}`, 50, 60);
      if (!userRateLimit.success) {
        return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
      }

      // Puis déduire les crédits atomiquement
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

    // Sauvegarder en base si utilisateur connecté
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

    // Récupérer les crédits restants après déduction atomique
    let creditsRemaining: number | null = null;
    if (user) {
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { credits: true },
      });
      creditsRemaining = updatedUser?.credits ?? null;
    }

    // Réponse
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

    // Cache HTTP - différent selon le plan utilisateur
    // Pour les utilisateurs gratuits ou anonymes: pas de cache (données potentiellement dynamiques)
    // Pour les utilisateurs premium: cache court (5 min) avec revalidation en arrière-plan
    if (user && userPlan && ["PRO", "BUSINESS"].includes(userPlan)) {
      // Premium: cache de 5 minutes avec stale-while-revalidate de 10 minutes
      response.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    } else {
      // Gratuit ou anonyme: cache très court (1 min)
      response.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    }

    // Vary sur l'auth pour differencier les réponses par utilisateur
    response.headers.set("Vary", "X-API-Key, Cookie, Authorization");

    return response;
  } catch (error) {
    console.error("[API] Validate error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
