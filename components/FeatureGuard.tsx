// =====================================================
// FEATURE GUARD COMPONENT
// =====================================================

import { useFeature } from '@/hooks/useEntitlements'
import { ReactNode } from 'react'

// =====================================================
// PROPS
// =====================================================

interface FeatureGuardProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
  /**
   * Show fallback even while loading (default: false)
   * Set to true to hide content until entitlement check completes
   */
  hideWhileLoading?: boolean
  /**
   * Custom message when feature is not available
   */
  message?: string
  /**
   * Show upgrade CTA in fallback
   */
  showUpgradeCTA?: boolean
  /**
   * For limit-based features, check usage against limit
   */
  checkLimit?: boolean
}

// =====================================================
// COMPONENT
// =====================================================

export function FeatureGuard({
  feature,
  children,
  fallback,
  hideWhileLoading = false,
  message,
  showUpgradeCTA = false,
  checkLimit = false,
}: FeatureGuardProps) {
  const { hasFeature, isLoading, plan } = useFeature(feature)

  // Check limit if requested
  let canAccess = hasFeature
  if (checkLimit && hasFeature) {
    // Import useLimit dynamically to avoid circular deps
    const { useLimit } = require('@/hooks/useEntitlements')
    const limitInfo = useLimit(feature)
    canAccess = !limitInfo.hasReachedLimit
  }

  // Show loading state
  if (isLoading && hideWhileLoading) {
    return null
  }

  // Check if can access
  if (!canAccess) {
    // Default fallback
    if (!fallback) {
      return (
        <DefaultFallback 
          feature={feature} 
          message={message}
          showUpgradeCTA={showUpgradeCTA}
          plan={plan}
        />
      )
    }
    return <>{fallback}</>
  }

  return <>{children}</>
}

// =====================================================
// DEFAULT FALLBACK
// =====================================================

function DefaultFallback({ 
  feature, 
  message,
  showUpgradeCTA,
  plan,
}: { 
  feature: string
  message?: string
  showUpgradeCTA?: boolean
  plan: string
}) {
  const featureMessages: Record<string, string> = {
    EXPORT_PDF: 'Export PDF is not available on your plan',
    BULK_VALIDATION: 'Bulk validation is not available on your plan',
    AI_SUMMARY: 'AI Summary is not available on your plan',
    API_ACCESS: 'API access is not available on your plan',
    TEAM_MEMBERS: 'Team members is not available on your plan',
    NEW_DASHBOARD: 'New Dashboard is not available on your plan',
    ADVANCED_ANALYTICS: 'Advanced Analytics is not available on your plan',
    CUSTOM_DOMAINS: 'Custom domains is not available on your plan',
    PRIORITY_SUPPORT: 'Priority support is not available on your plan',
    WEBHOOKS: 'Webhooks is not available on your plan',
    AUDIT_LOGS: 'Audit logs is not available on your plan',
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <h3 className="font-medium text-amber-800 mb-2">
        {message ?? featureMessages[feature] ?? `Feature not available: ${feature}`}
      </h3>
      {showUpgradeCTA && (
        <a
          href="/billing/upgrade"
          className="inline-block mt-2 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
        >
          Upgrade to Pro - Starting at $29/mo
        </a>
      )}
      <p className="text-sm text-amber-600 mt-2">
        Current plan: {plan.toUpperCase()}
      </p>
    </div>
  )
}

// =====================================================
// EXPORT DEFAULT FOR CONVENIENCE
// =====================================================

export default FeatureGuard