// =====================================================
// ADMIN: Entitlement Overrides
// GET /api/admin/entitlements/overrides
// POST /api/admin/entitlements/overrides
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { entitlementRepository } from '@/lib/entitlements/prisma-repository'
import { featureGateService } from '@/lib/entitlements/service'
import { z } from 'zod'
import type { OverrideScope } from '@/lib/entitlements/types'

// Helper to check admin
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.includes('admin')) {
    throw new Error('Admin only')
  }
  return session.user
}

// GET /api/admin/entitlements/overrides
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') as OverrideScope | null
    const scopeId = searchParams.get('scopeId')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    let overrides: any[]

    if (scope && scopeId) {
      overrides = await entitlementRepository.getOverridesForScope(scope, scopeId)
    } else if (scope) {
      // Get all overrides for scope
      const { prisma } = await import('@/lib/prisma')
      overrides = await prisma.entitlementOverride.findMany({
        where: { scope },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      const { prisma } = await import('@/lib/prisma')
      overrides = await prisma.entitlementOverride.findMany({
        orderBy: { createdAt: 'desc' },
      })
    }

    const skip = (page - 1) * limit
    const paginated = overrides.slice(skip, skip + limit)

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: overrides.length,
        totalPages: Math.ceil(overrides.length / limit),
      },
    })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Overrides] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/entitlements/overrides
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin()

    const body = await req.json()
    const schema = z.object({
      scope: z.enum(['ORG', 'USER']),
      scopeId: z.string().min(1),
      featureKey: z.string().min(1),
      enabled: z.boolean(),
      limitValue: z.number().int().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      reason: z.string().min(1), // Reason is required for audit
    })

    const data = schema.parse(body)

    const override = await entitlementRepository.createOverride({
      scope: data.scope,
      scopeId: data.scopeId,
      featureKey: data.featureKey,
      enabled: data.enabled,
      limitValue: data.limitValue ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      reason: data.reason,
      createdBy: user.id,
    })

    // Invalidate cache
    if (data.scope === 'ORG') {
      await featureGateService.invalidateCache(data.scopeId)
    }

    return NextResponse.json(override, { status: 201 })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Overrides] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}