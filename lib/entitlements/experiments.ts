// =====================================================
// A/B TESTING - EXPERIMENTS WITH STABLE HASHING
// =====================================================

import type { ExperimentConfig } from './types'
import { entitlementRepository } from './prisma-repository'

// Simple non-cryptographic hash for consistent bucket assignment
// Uses MurmurHash3-inspired algorithm
function murmurHash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    h = Math.imul(h ^ char, 0x5bd1e995)
    h ^= h >>> 15
  }
  return (h >>> 0) % 100
}

// =====================================================
// RESOLVE EXPERIMENT BUCKET
// =====================================================

/**
 * Resolve which bucket a user falls into for an experiment.
 * Uses stable hashing so same user always gets same bucket.
 * 
 * @param seed - Experiment seed (e.g., "NEW_DASHBOARD_v1")
 * @param userId - User identifier
 * @returns Bucket number 0-99
 */
export function resolveExperimentBucket(seed: string, userId: string): number {
  const hashInput = `${seed}:${userId}`
  return murmurHash(hashInput)
}

/**
 * Check if user is in experiment based on percentage.
 * 
 * @param seed - Experiment seed
 * @param userId - User identifier
 * @param percentage - Target percentage (0-100)
 * @returns true if user is in experiment
 */
export function isInExperiment(seed: string, userId: string, percentage: number): boolean {
  const bucket = resolveExperimentBucket(seed, userId)
  return bucket < percentage
}

/**
 * Get experiment config for a feature key.
 * 
 * @param featureKey - Feature key (e.g., "NEW_DASHBOARD")
 * @returns ExperimentConfig or null
 */
export async function getExperimentConfig(featureKey: string): Promise<ExperimentConfig | null> {
  const feature = await entitlementRepository.getFeature(featureKey)
  if (!feature || feature.type !== 'EXPERIMENT') {
    return null
  }

  // Try to get from active subscription's plan feature
  // This would need orgId and userId passed - we'll handle this in the service

  return feature.defaultConfig as ExperimentConfig | null
}

// =====================================================
// EXPERIMENT HELPERS
// =====================================================

/**
 * Get experiment result with override support.
 * Override at user level can force enabled=true for QA/Preview.
 * 
 * @param orgId - Organization ID
 * @param userId - User ID
 * @param featureKey - Experiment feature key
 * @returns boolean indicating if user is in experiment
 */
export async function isInExperimentWithOverride(
  orgId: string,
  userId: string,
  featureKey: string
): Promise<boolean> {
  // Check for user override first (can force enable for QA)
  const userOverride = await entitlementRepository.getOverride('USER', userId, featureKey)
  if (userOverride && userOverride.enabled) {
    return true // Override forces enabled
  }

  // Get experiment config from plan
  const subscription = await entitlementRepository.getActiveSubscription(orgId)
  if (!subscription) {
    return false // No subscription = not in experiment
  }

  const planFeatures = await entitlementRepository.getPlanFeatures(subscription.planKey)
  const feature = await entitlementRepository.getFeature(featureKey)
  
  if (!feature || feature.type !== 'EXPERIMENT') {
    return false
  }

  const planFeature = planFeatures.find((pf) => pf.featureId === feature.id)
  if (!planFeature) {
    return false
  }

  const config = planFeature.configJson as ExperimentConfig | null 
    ?? (feature.defaultConfig as ExperimentConfig | null)

  if (!config) {
    return false
  }

  return isInExperiment(config.seed, userId, config.percentage)
}

/**
 * Get experiment config from a plan.
 * 
 * @param planKey - Plan key
 * @param featureKey - Experiment feature key
 * @returns ExperimentConfig or null
 */
export async function getExperimentConfigFromPlan(
  planKey: string,
  featureKey: string
): Promise<ExperimentConfig | null> {
  const planFeatures = await entitlementRepository.getPlanFeatures(planKey)
  const feature = await entitlementRepository.getFeature(featureKey)

  if (!feature || feature.type !== 'EXPERIMENT') {
    return null
  }

  const planFeature = planFeatures.find((pf) => pf.featureId === feature.id)
  if (!planFeature) {
    return null
  }

  return planFeature.configJson as ExperimentConfig | null 
    ?? (feature.defaultConfig as ExperimentConfig | null)
}

// =====================================================
// DISTRIBUTION TESTING
// =====================================================

/**
 * Test experiment distribution across N users.
 * Returns actual distribution percentage.
 * 
 * @param seed - Experiment seed
 * @param userIds - Array of user IDs to test
 * @param expectedPercentage - Expected percentage
 * @returns Actual distribution percentage
 */
export function testExperimentDistribution(
  seed: string,
  userIds: string[],
  expectedPercentage: number
): { inExperiment: number; percentage: number; expected: number } {
  let inExperiment = 0

  for (const userId of userIds) {
    if (isInExperiment(seed, userId, expectedPercentage)) {
      inExperiment++
    }
  }

  const percentage = (inExperiment / userIds.length) * 100

  return {
    inExperiment,
    percentage,
    expected: expectedPercentage,
  }
}

/**
 * Generate test user IDs for distribution testing.
 * 
 * @param count - Number of user IDs to generate
 * @returns Array of user IDs
 */
export function generateTestUserIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `test-user-${i}`)
}

// =====================================================
// EXAMPLE USAGE
// =====================================================

/*
// Example: Test 50/50 split
const users = generateTestUserIds(10000)
const result = testExperimentDistribution('NEW_DASHBOARD_v1', users, 50)
console.log(result)
// { inExperiment: 4985, percentage: 49.85, expected: 50 }

// Example: Check specific user
const bucket = resolveExperimentBucket('NEW_DASHBOARD_v1', 'user-123')
console.log(`User in bucket ${bucket} of 100`)

const isInExp = isInExperiment('NEW_DASHBOARD_v1', 'user-123', 50)
console.log(`User in experiment: ${isInExp}`)
*/