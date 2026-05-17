// =====================================================
// DOWNGRADE SERVICE - GRACEFUL/IMMEDIATE/FREEZE STRATEGIES
// =====================================================

import { entitlementRepository } from './prisma-repository'
import { featureGateService } from './service'
import type { DowngradePreview, DowngradeStrategy } from './types'

// Logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[DowngradeService] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: any) => console.warn(`[DowngradeService] ${msg}`, meta ?? ''),
}

// =====================================================
// DOWNGRADE SERVICE CLASS
// =====================================================

export class DowngradeService {
  // =====================================================
  // GET DOWNGRADE PREVIEW
  // =====================================================

  /**
   * Get preview of what features will be affected when downgrading to target plan.
   * Used by admin to show what will change before confirming.
   */
  async getDowngradePreview(orgId: string, targetPlanKey: string): Promise<{
    willLoseAccess: string[]
    willBeLimited: string[]
    currentPeriodEnd: Date | null
  }> {
    const subscription = await entitlementRepository.getActiveSubscription(orgId)
    
    if (!subscription) {
      throw new Error('No active subscription found')
    }

    const previews = await entitlementRepository.getDowngradePreview(orgId, targetPlanKey)
    
    const willLoseAccess: string[] = []
    const willBeLimited: string[] = []

    for (const preview of previews) {
      if (preview.willBeAffected) {
        if (typeof preview.currentValue === 'boolean' && preview.currentValue === true && 
            typeof preview.newValue === 'boolean' && preview.newValue === false) {
          willLoseAccess.push(preview.featureKey)
        }
        if (typeof preview.currentValue === 'number' && typeof preview.newValue === 'number' &&
            preview.newValue < preview.currentValue) {
          willBeLimited.push(preview.featureKey)
        }
      }
    }

    return {
      willLoseAccess,
      willBeLimited,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }
  }

  // =====================================================
  // EXECUTE DOWNGRADE
  // =====================================================

  /**
   * Execute downgrade based on strategy.
   * Called when Stripe webhook indicates plan change (downgrade).
   */
  async executeDowngrade(
    orgId: string,
    targetPlanKey: string,
    immediate: boolean = false
  ): Promise<{
    success: boolean
    strategy: DowngradeStrategy
    affectedFeatures: string[]
    scheduledFor?: Date
  }> {
    const subscription = await entitlementRepository.getActiveSubscription(orgId)
    
    if (!subscription) {
      throw new Error('No active subscription found')
    }

    const previews = await entitlementRepository.getDowngradePreview(orgId, targetPlanKey)
    
    // Determine strategy per feature
    const affectedFeatures: string[] = []
    let strategy: DowngradeStrategy = immediate ? 'IMMEDIATE' : 'GRACEFUL'

    for (const preview of previews) {
      if (preview.willBeAffected) {
        affectedFeatures.push(preview.featureKey)
        
        // Use the strategy configured for this feature
        if (preview.downgradeStrategy === 'FREEZE') {
          strategy = 'FREEZE'
        } else if (preview.downgradeStrategy === 'IMMEDIATE' && immediate) {
          strategy = 'IMMEDIATE'
        }
      }
    }

    switch (strategy) {
      case 'IMMEDIATE':
        // Cut access immediately
        await this.handleImmediateDowngrade(orgId, affectedFeatures)
        break

      case 'GRACEFUL':
        // Keep access until period end, schedule downgrade
        await this.handleGracefulDowngrade(orgId, targetPlanKey, subscription.currentPeriodEnd, affectedFeatures)
        break

      case 'FREEZE':
        // Block new actions but keep data
        await this.handleFreezeDowngrade(orgId, affectedFeatures)
        break
    }

    // Invalidate cache
    await featureGateService.invalidateCache(orgId)

    logger.info(`Downgrade executed for org ${orgId}`, { 
      strategy, 
      targetPlan: targetPlanKey,
      affectedCount: affectedFeatures.length 
    })

    return {
      success: true,
      strategy,
      affectedFeatures,
      scheduledFor: strategy === 'GRACEFUL' ? subscription.currentPeriodEnd : undefined,
    }
  }

  // =====================================================
  // CHECK IF FEATURE IS ACCESSIBLE (considering downgrade strategy)
  // =====================================================

  /**
   * Check if feature is accessible considering downgrade strategy.
   * For GRACEFUL: still accessible if before period end
   * For IMMEDIATE: not accessible
   * For FREEZE: not accessible (but can read existing data)
   */
  async isFeatureAccessibleAfterDowngrade(
    orgId: string,
    featureKey: string,
    targetPlanKey: string
  ): Promise<{
    accessible: boolean
    reason?: string
    expiresAt?: Date
  }> {
    const subscription = await entitlementRepository.getActiveSubscription(orgId)
    if (!subscription) {
      return { accessible: false, reason: 'No subscription' }
    }

    const previews = await entitlementRepository.getDowngradePreview(orgId, targetPlanKey)
    const preview = previews.find((p) => p.featureKey === featureKey)

    if (!preview || !preview.willBeAffected) {
      return { accessible: true } // Not affected
    }

    const strategy = preview.downgradeStrategy as DowngradeStrategy

    switch (strategy) {
      case 'IMMEDIATE':
        return { 
          accessible: false, 
          reason: 'Downgrade immediate - feature disabled' 
        }

      case 'GRACEFUL':
        const now = new Date()
        if (now < subscription.currentPeriodEnd) {
          return { 
            accessible: true, 
            reason: 'Graceful downgrade - access until period end',
            expiresAt: subscription.currentPeriodEnd 
          }
        }
        return { 
          accessible: false, 
          reason: 'Graceful downgrade - period ended' 
        }

      case 'FREEZE':
        return { 
          accessible: false, 
          reason: 'Freeze - new actions blocked' 
        }

      default:
        return { accessible: false }
    }
  }

  // =====================================================
  // PRIVATE HANDLERS
  // =====================================================

  private async handleImmediateDowngrade(orgId: string, features: string[]): Promise<void> {
    // For immediate, cache is already invalidated so feature checks will fail
    // No additional action needed - the feature flag logic handles it
    
    logger.info(`Immediate downgrade applied for org ${orgId}`, { features })
  }

  private async handleGracefulDowngrade(
    orgId: string,
    targetPlanKey: string,
    periodEnd: Date,
    features: string[]
  ): Promise<void> {
    // Create org-level override to maintain access until period end
    for (const featureKey of features) {
      // Check if override already exists
      const existing = await entitlementRepository.getOverride('ORG', orgId, featureKey)
      
      if (!existing) {
        // Create override to keep enabled until period end
        await entitlementRepository.createOverride({
          scope: 'ORG',
          scopeId: orgId,
          featureKey,
          enabled: true,
          expiresAt: periodEnd,
          reason: 'Graceful downgrade - maintain access until period end',
        })
      }
    }

    logger.info(`Graceful downgrade scheduled for org ${orgId}`, { 
      features, 
      until: periodEnd.toISOString() 
    })
  }

  private async handleFreezeDowngrade(orgId: string, features: string[]): Promise<void> {
    // For freeze, we could create a special override type
    // For now, just invalidate cache - consume operations will fail
    
    logger.info(`Freeze downgrade applied for org ${orgId}`, { features })
  }
}

// Export singleton
export const downgradeService = new DowngradeService()