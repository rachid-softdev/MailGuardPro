// =====================================================
// TYPES PARTAGES - FEATURE FLAGS + ENTITLEMENTS
// =====================================================

export type FeatureType = 'BOOLEAN' | 'LIMIT' | 'EXPERIMENT'

export type OverrideScope = 'ORG' | 'USER'

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'

export type DowngradeStrategy = 'GRACEFUL' | 'IMMEDIATE' | 'FREEZE'

export type ResolvedVia = 'user_override' | 'org_override' | 'plan' | 'fallback'

// =====================================================
// TYPES DE CONFIGURATION
// =====================================================

export interface ExperimentConfig {
  percentage: number
  seed: string
}

export interface FeatureConfig {
  type: FeatureType
  defaultConfig?: ExperimentConfig
}

// =====================================================
// TYPES DE RÉSOLUTION
// =====================================================

export interface DebugTrace {
  featureKey: string
  resolvedVia: ResolvedVia
  value: boolean | number | null
  overrideId?: string
  expiresAt?: Date
  planKey?: string
  overrideScope?: OverrideScope
  overrideScopeId?: string
  experimentBucket?: number
  inExperiment?: boolean
}

// =====================================================
// TYPES DE CONSOMMATION
// =====================================================

export interface ConsumeResult {
  success: boolean
  featureKey: string
  newUsageCount: number
  limit: number | null
  remaining: number | null
}

export interface ConsumeError {
  error: 'LIMIT_REACHED' | 'FEATURE_NOT_AVAILABLE' | 'SUBSCRIPTION_EXPIRED'
  feature: string
  limit?: number
  used?: number
  reset_at?: string
  plan_required?: string
  current_plan?: string
  upgrade_url?: string
  renew_url?: string
}

// =====================================================
// TYPES D'ENTITLEMENTS
// =====================================================

export interface EntitlementMap {
  plan: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  usage: Record<string, number>
  reset_at: Record<string, string>
  experiments: Record<string, boolean>
}

export interface UserEntitlements {
  plan: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  usage: Record<string, number>
  reset_at: Record<string, string>
  isEnterprise: boolean
}

// =====================================================
// TYPES POUR LE CACHE
// =====================================================

export interface CachedEntitlements {
  plan: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  // Ne pas mettre à jour le usage dans le cache (trop fréquent)
  // Le cache est pour les entitlements statiques
  cachedAt: number
  ttl: number
}

// =====================================================
// TYPES POUR ADMIN
// =====================================================

export interface PlanWithFeatures {
  id: string
  key: string
  name: string
  priceMonthly: number
  isActive: boolean
  features: {
    key: string
    description: string | null
    type: FeatureType
    enabled: boolean
    limitValue: number | null
    configJson: ExperimentConfig | null
    downgradeStrategy: DowngradeStrategy
  }[]
}

export interface DowngradePreview {
  featureKey: string
  currentValue: boolean | number | null
  newValue: boolean | number | null
  downgradeStrategy: DowngradeStrategy
  willBeAffected: boolean
  usersAffected?: number
}

export interface FeatureListItem {
  id: string
  key: string
  description: string | null
  type: FeatureType
  defaultConfig: ExperimentConfig | null
  createdAt: Date
}

// =====================================================
// TYPES POUR STRIPE WEBHOOK
// =====================================================

export interface StripeWebhookEvent {
  id: string
  type: string
  processedAt: Date
  orgId?: string
}

// =====================================================
// CONSTANTES
// =====================================================

export const FEATURE_KEYS = {
  EXPORT_PDF: 'EXPORT_PDF',
  BULK_VALIDATION: 'BULK_VALIDATION',
  AI_SUMMARY: 'AI_SUMMARY',
  API_ACCESS: 'API_ACCESS',
  TEAM_MEMBERS: 'TEAM_MEMBERS',
  NEW_DASHBOARD: 'NEW_DASHBOARD',
  ADVANCED_ANALYTICS: 'ADVANCED_ANALYTICS',
  CUSTOM_DOMAINS: 'CUSTOM_DOMAINS',
  PRIORITY_SUPPORT: 'PRIORITY_SUPPORT',
  WEBHOOKS: 'WEBHOOKS',
  AUDIT_LOGS: 'AUDIT_LOGS',
} as const

export const PLAN_KEYS = {
  FREE: 'free',
  STARTER: 'starter',
  PRO: 'pro',
  BUSINESS: 'business',
} as const

export const SUBSCRIPTION_ACTIVE_STATUSES: SubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
]

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const