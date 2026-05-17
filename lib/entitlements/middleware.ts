// =====================================================
// MIDDLEWARE FACTORIES - FRAMEWORK-AGNOSTIC
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { featureGateService } from '../service'
import type { ConsumeError } from '../types'

// =====================================================
// TYPES
// =====================================================

export type OrgResolver = (req: NextRequest | Request) => Promise<string>
export type UserResolver = (req: NextRequest | Request) => Promise<string | undefined>

// =====================================================
// DEFAULT RESOLVERS (customize per app)
// =====================================================

/**
 * Default org resolver - extracts orgId from auth session or headers
 * Override this based on your auth implementation
 */
export async function defaultOrgResolver(req: NextRequest | Request): Promise<string> {
  // Try to get from headers (set by auth middleware)
  const orgId = req.headers.get('x-org-id')
  if (orgId) return orgId

  // Try from URL params
  const url = req.url
  const match = url.match(/\/orgs\/([^\/]+)/)
  if (match) return match[1]

  // Try from query params
  const urlObj = new URL(url)
  const queryOrgId = urlObj.searchParams.get('orgId')
  if (queryOrgId) return queryOrgId

  throw new Error('Could not resolve orgId')
}

/**
 * Default user resolver - extracts userId from auth session
 */
export async function defaultUserResolver(req: NextRequest | Request): Promise<string | undefined> {
  // Try to get from headers (set by auth middleware)
  const userId = req.headers.get('x-user-id')
  if (userId) return userId

  // Could also get from session/token
  return undefined
}

// =====================================================
// MIDDLEWARE FACTORIES
// =====================================================

/**
 * Create a Next.js middleware that checks if feature is enabled.
 * Throws 403 if not enabled.
 */
export function createRequireFeature(
  featureKey: string,
  options: {
    orgResolver?: OrgResolver
    userResolver?: UserResolver
  } = {}
) {
  const { orgResolver = defaultOrgResolver, userResolver = defaultUserResolver } = options

  return async function requireFeatureMiddleware(req: NextRequest) {
    const orgId = await orgResolver(req)
    const userId = await userResolver(req)

    try {
      await featureGateService.assertFeature(orgId, featureKey, userId)
    } catch (error: any) {
      if (error.code === 'FEATURE_NOT_AVAILABLE') {
        return NextResponse.json(
          {
            error: 'FEATURE_NOT_AVAILABLE',
            feature: error.feature,
            plan_required: error.plan_required,
            current_plan: error.current_plan,
            upgrade_url: error.upgrade_url,
          },
          { status: 403 }
        )
      }
      throw error
    }
  }
}

/**
 * Create a Next.js middleware that checks limit without consuming.
 * Returns remaining quota info.
 */
export function createRequireLimit(
  featureKey: string,
  options: {
    orgResolver?: OrgResolver
    userResolver?: UserResolver
    amount?: number
  } = {}
) {
  const { 
    orgResolver = defaultOrgResolver, 
    userResolver = defaultUserResolver,
    amount = 1 
  } = options

  return async function requireLimitMiddleware(req: NextRequest) {
    const orgId = await orgResolver(req)
    const userId = await userResolver(req)

    const canConsume = await featureGateService.canConsume(orgId, featureKey, amount, userId)
    
    if (!canConsume) {
      const limit = await featureGateService.getLimit(orgId, featureKey, userId)
      const entitlements = await featureGateService.getAllEntitlements(orgId, userId)
      const used = entitlements.usage[featureKey] ?? 0

      return NextResponse.json(
        {
          error: 'LIMIT_REACHED',
          feature: featureKey,
          limit: limit ?? 'unlimited',
          used,
          reset_at: entitlements.reset_at[featureKey],
          upgrade_url: '/billing/upgrade',
        },
        { status: 402 }
      )
    }
  }
}

/**
 * Create a Next.js middleware that checks and consumes quota.
 * Use for operations that consume usage.
 */
export function createConsumeFeature(
  featureKey: string,
  options: {
    orgResolver?: OrgResolver
    userResolver?: UserResolver
    amount?: number
  } = {}
) {
  const { 
    orgResolver = defaultOrgResolver, 
    userResolver = defaultUserResolver,
    amount = 1 
  } = options

  return async function consumeFeatureMiddleware(req: NextRequest) {
    const orgId = await orgResolver(req)
    const userId = await userResolver(req)

    try {
      const result = await featureGateService.consume(orgId, featureKey, amount, userId)
      
      // Attach result to request for downstream handlers
      ;(req as any).entitlementConsume = result
      
      return null // Continue to handler
    } catch (error: any) {
      if (error.error === 'LIMIT_REACHED' || error.error === 'FEATURE_NOT_AVAILABLE') {
        return NextResponse.json(
          {
            error: error.error,
            feature: error.feature,
            limit: error.limit,
            used: error.used,
            reset_at: error.reset_at,
            plan_required: error.plan_required,
            current_plan: error.current_plan,
            upgrade_url: error.upgrade_url ?? '/billing/upgrade',
            renew_url: error.renew_url,
          },
          { status: error.error === 'LIMIT_REACHED' ? 402 : 403 }
        )
      }
      throw error
    }
  }
}

// =====================================================
// HELPER TO CHECK CONSUME RESULT IN HANDLER
// =====================================================

export function getConsumeResult(req: NextRequest) {
  return (req as any).entitlementConsume
}