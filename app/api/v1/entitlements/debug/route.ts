// =====================================================
// GET /api/v1/entitlements/debug - Debug trace for a feature
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { featureGateService } from '@/lib/entitlements/service'
import { auth } from '@/lib/auth'

// GET /api/v1/entitlements/debug?orgId=X&feature=Y
export async function GET(req: NextRequest) {
  try {
    // Check admin auth
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For now, check if user is admin via a role or email
    // In production, implement proper admin check
    const isAdmin = session.user.email?.includes('admin') ?? false
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('orgId')
    const featureKey = searchParams.get('feature')
    const userId = searchParams.get('userId') ?? undefined

    if (!orgId || !featureKey) {
      return NextResponse.json(
        { error: 'Missing required params: orgId, feature' },
        { status: 400 }
      )
    }

    // Get debug trace
    const debugTrace = await featureGateService.getDebugTrace(orgId, featureKey, userId)

    return NextResponse.json(debugTrace)
  } catch (error) {
    console.error('[Entitlements Debug] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}