// =====================================================
// ADMIN: Cache Invalidation
// POST /api/admin/entitlements/cache/invalidate
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { featureGateService } from '@/lib/entitlements/service'

// Helper to check admin
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.includes('admin')) {
    throw new Error('Admin only')
  }
  return session.user
}

// POST /api/admin/entitlements/cache/invalidate
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { orgId } = body

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing required field: orgId' },
        { status: 400 }
      )
    }

    await featureGateService.invalidateCache(orgId)

    return NextResponse.json({
      success: true,
      message: `Cache invalidated for org ${orgId}`,
    })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Cache] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}