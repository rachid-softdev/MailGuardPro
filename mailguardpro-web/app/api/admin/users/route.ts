// API Route: Admin - User management
// GET  /api/admin/users
// POST /api/admin/users

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

const VALID_ROLES = ["USER", "ADMIN"] as const;

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().optional(),
  roles: z
    .array(z.enum(VALID_ROLES))
    .min(1, "At least one role is required")
    .default(["USER"]),
});

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        userRoles: { select: { role: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Admin GET users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, name, roles } = parsed.data;

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: roles[0],
        userRoles: {
          create: roles.map((role) => ({ role })),
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        userRoles: { select: { role: true } },
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Admin POST users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
