// API Route: Gestion des clés API
// GET /api/v1/api-keys - Lister les clés
// POST /api/v1/api-keys - Créer une clé

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/crypto";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Helper pour générer une clé API
function generateApiKey(prefix: string = "mg_live"): string {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}_${uuid.substring(0, 32)}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    console.error("[API] API keys list error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { name } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    if (name.length > 50) {
      return NextResponse.json(
        { success: false, error: "Name must be less than 50 characters" },
        { status: 400 },
      );
    }

    // Vérifier le nombre de clés existantes
    const existingKeysCount = await prisma.apiKey.count({
      where: { userId: session.user.id },
    });

    if (existingKeysCount >= 10) {
      return NextResponse.json(
        { success: false, error: "Maximum 10 API keys allowed" },
        { status: 400 },
      );
    }

    // Générer la clé
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12);

    // Sauvegarder en base
    const newKey = await prisma.apiKey.create({
      data: {
        keyHash,
        keyPrefix,
        name: name.trim(),
        userId: session.user.id,
      },
    });

    // Audit log
    logAudit({
      userId: session.user.id,
      action: AuditAction.API_KEY_CREATED,
      resource: AuditResource.API_KEY,
      resourceId: newKey.id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { keyName: name.trim(), keyPrefix },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newKey.id,
        key: apiKey, // Retourner seulement une fois!
        keyPrefix: newKey.keyPrefix,
        name: newKey.name,
        isActive: newKey.isActive,
        createdAt: newKey.createdAt,
      },
    });
  } catch (error) {
    console.error("[API] API key create error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
