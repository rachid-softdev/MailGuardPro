// =====================================================
// ADMIN: Plans Management
// GET /api/admin/entitlements/plans
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { entitlementRepository } from '@/lib/entitlements/prisma-repository'
import { z } from 'zod'

// Helper to check admin
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.includes('admin')) {
    throw new Error('Admin only')
  }
  return session.user
}

// GET /api/admin/entitlements/plans
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')
    const sort = searchParams.get('sort') ?? 'key:asc'

    const [sortField, sortOrder] = sort.split(':')
    const skip = (page - 1) * limit

    const plans = await entitlementRepository.getAllPlans()
    
    // Sort
    const sortedPlans = [...plans].sort((a: any, b: any) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

    const paginated = sortedPlans.slice(skip, skip + limit)

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: plans.length,
        totalPages: Math.ceil(plans.length / limit),
      },
    })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Plans] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/entitlements/plans
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const schema = z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      priceMonthly: z.number().int().min(0),
      isActive: z.boolean().default(true),
    })

    const data = schema.parse(body)

    // Check if exists
    const existing = await entitlementRepository.getPlan(data.key)
    if (existing) {
      return NextResponse.json(
        { error: 'Plan with this key already exists' },
        { status: 400 }
      )
    }

    // Create via Prisma directly (repository doesn't have create)
    const { prisma } = await import('@/lib/prisma')
    const plan = await prisma.plan.create({
      data: {
        key: data.key,
        name: data.name,
        priceMonthly: data.priceMonthly,
        isActive: data.isActive,
      },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Plans] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}