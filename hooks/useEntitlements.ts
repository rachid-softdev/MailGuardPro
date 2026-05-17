// =====================================================
// FRONTEND HOOKS - ENTITLEMENTS
// =====================================================

import { useState, useEffect, useCallback } from 'react'

export interface UserEntitlements {
  plan: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  usage: Record<string, number>
  reset_at: Record<string, string>
  isEnterprise: boolean
}

const ENTITLEMENTS_ENDPOINT = '/api/v1/entitlements/me'
const CACHE_TIME = 60000 // 60 seconds

// =====================================================
// USE ENTITLEMENTS - Full entitlement map
// =====================================================

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<UserEntitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEntitlements = useCallback(async (force = false) => {
    // Check cache
    if (!force) {
      const cached = sessionStorage.getItem('entitlements')
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TIME) {
          setEntitlements(data)
          setLoading(false)
          return
        }
      }
    }

    try {
      setLoading(true)
      const res = await fetch(ENTITLEMENTS_ENDPOINT)
      
      if (!res.ok) {
        throw new Error('Failed to fetch entitlements')
      }
      
      const data = await res.json()
      
      // Cache it
      sessionStorage.setItem('entitlements', JSON.stringify({
        data,
        timestamp: Date.now(),
      }))
      
      setEntitlements(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntitlements()
  }, [fetchEntitlements])

  const refetch = useCallback(() => {
    sessionStorage.removeItem('entitlements')
    fetchEntitlements(true)
  }, [fetchEntitlements])

  return { entitlements, loading, error, refetch }
}

// =====================================================
// USE FEATURE - Boolean check
// =====================================================

export function useFeature(featureKey: string) {
  const { entitlements, loading, error } = useEntitlements()

  const hasFeature = entitlements?.features[featureKey] ?? false

  return {
    hasFeature,
    isLoading: loading,
    error,
    plan: entitlements?.plan ?? 'free',
    isEnterprise: entitlements?.isEnterprise ?? false,
  }
}

// =====================================================
// USE LIMIT - Limit + usage info
// =====================================================

export interface LimitInfo {
  limit: number | null
  used: number
  remaining: number | null
  resetAt: string | null
  hasReachedLimit: boolean
}

export function useLimit(limitKey: string): LimitInfo & { isLoading: boolean } {
  const { entitlements, loading } = useEntitlements()

  const limit = entitlements?.limits[limitKey] ?? 0
  const used = entitlements?.usage[limitKey] ?? 0
  const resetAt = entitlements?.reset_at[limitKey] ?? null

  const remaining = limit !== null ? Math.max(0, limit - used) : null

  return {
    limit,
    used,
    remaining,
    resetAt,
    hasReachedLimit: limit !== null && used >= limit,
    isLoading: loading,
  }
}

// =====================================================
// INvalidate cache on client (for when user upgrades)
// =====================================================

export function invalidateEntitlementsCache() {
  sessionStorage.removeItem('entitlements')
}