// =====================================================
// GET /api/v1/entitlements/me - Current user's entitlements
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { featureGateService } from '@/lib/entitlements/service'
import { entitlementRepository } from '@/lib/entitlements/prisma-repository'

// GET /api/v1/entitlements/me
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    
    // Resolve orgId from user - for now, use userId as personal org
    // In production, would look up user's organization
    let orgId = userId
    
    // Check if user has an organization linked
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })
    
    if (user?.organizationId) {
      orgId = user.organizationId
    } else {
      // Try to find or create personal organization using Stripe customer ID
      const stripeCustomerId = session.user.email // Using email as proxy for now
      const existingOrg = await entitlementRepository.getOrganizationByStripeCustomerId(stripeCustomerId!)
      
      if (existingOrg) {
        orgId = existingOrg.id
      } else {
        // Create personal org if needed
        const newOrg = await entitlementRepository.createOrganization({
          name: session.user.email?.split('@')[0] ?? 'Personal',
          stripeCustomerId: session.user.email ?? undefined,
          isPersonal: true,
        })
        orgId = newOrg.id
      }
    }

    // Get full entitlements
    const entitlements = await featureGateService.getAllEntitlements(orgId, userId)

    // Determine if enterprise (unlimited)
    const isEnterprise = Object.values(entitlements.limits).some(v => v === null)

    // Build response
    const response = {
      plan: entitlements.plan,
      features: entitlements.features,
      limits: entitlements.limits,
      usage: entitlements.usage,
      reset_at: entitlements.reset_at,
      isEnterprise,
    }

    // Cache for 60 seconds client-side
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error('[Entitlements] Error fetching entitlements:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}