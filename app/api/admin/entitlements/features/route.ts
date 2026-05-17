// =====================================================
// ADMIN: Features Management
// GET /api/admin/entitlements/features
// POST /api/admin/entitlements/features
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { entitlementRepository } from '@/lib/entitlements/prisma-repository'
import { z } from 'zod'
import type { FeatureType } from '@/lib/entitlements/types'

// Helper to check admin
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.includes('admin')) {
    throw new Error('Admin only')
  }
  return session.user
}

// GET /api/admin/entitlements/features
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')

    const allFeatures = await entitlementRepository.getAllFeatures()
    const skip = (page - 1) * limit
    const paginated = allFeatures.slice(skip, skip + limit)

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: allFeatures.length,
        totalPages: Math.ceil(allFeatures.length / limit),
      },
    })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Features] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/entitlements/features
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const schema = z.object({
      key: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(['BOOLEAN', 'LIMIT', 'EXPERIMENT']),
      defaultConfig: z.object({
        percentage: z.number().min(0).max(100).optional(),
        seed: z.string().optional(),
      }).optional(),
    })

    const data = schema.parse(body)

    // Check if exists
    const existing = await entitlementRepository.getFeature(data.key)
    if (existing) {
      return NextResponse.json(
        { error: 'Feature with this key already exists' },
        { status: 400 }
      )
    }

    const feature = await entitlementRepository.createFeature({
      key: data.key,
      description: data.description,
      type: data.type as FeatureType,
      defaultConfig: data.defaultConfig ?? undefined,
    })

    return NextResponse.json(feature, { status: 201 })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Features] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}