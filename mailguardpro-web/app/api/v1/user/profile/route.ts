// API Route: Profil utilisateur
// GET /api/v1/user/profile
// PATCH /api/v1/user/profile

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        credits: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    loggerApi.error({ err: error }, "User profile error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { data: body, error: bodyError } = await parseJsonBody(req);
    if (bodyError) return bodyError;
    const validation = updateProfileSchema.safeParse(body);
    if (!validation.success) {
      loggerApi.warn({ errors: validation.error.issues }, "Input validation failed");
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { name } = validation.data;

    // Update user
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name !== undefined && { name }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        credits: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    loggerApi.error({ err: error }, "User profile update error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
