// =====================================================
// ADMIN: Downgrade Preview
// GET /api/admin/entitlements/orgs/:orgId/downgrade-preview?targetPlan=X
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { downgradeService } from '@/lib/entitlements/downgrade-service'

// Helper to check admin
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email?.includes('admin')) {
    throw new Error('Admin only')
  }
  return session.user
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await requireAdmin()

    const { orgId } = await params
    const { searchParams } = new URL(req.url)
    const targetPlan = searchParams.get('targetPlan')

    if (!targetPlan) {
      return NextResponse.json(
        { error: 'Missing required query param: targetPlan' },
        { status: 400 }
      )
    }

    const preview = await downgradeService.getDowngradePreview(orgId, targetPlan)

    return NextResponse.json({
      orgId,
      targetPlan,
      features: preview,
    })
  } catch (error: any) {
    if (error.message === 'Admin only') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[Admin Downgrade Preview] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}