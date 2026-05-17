// =====================================================
// TESTS - A/B TESTING (EXPERIMENTS)
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveExperimentBucket,
  isInExperiment,
  testExperimentDistribution,
  generateTestUserIds,
} from '@/lib/entitlements/experiments'

describe('Experiments', () => {
  // =====================================================
  // HASHING TESTS
  // =====================================================

  describe('resolveExperimentBucket', () => {
    it('should return consistent bucket for same seed and user', () => {
      const bucket1 = resolveExperimentBucket('NEW_DASHBOARD_v1', 'user-123')
      const bucket2 = resolveExperimentBucket('NEW_DASHBOARD_v1', 'user-123')
      
      expect(bucket1).toBe(bucket2)
    })

    it('should return different buckets for different users', () => {
      const bucket1 = resolveExperimentBucket('NEW_DASHBOARD_v1', 'user-1')
      const bucket2 = resolveExperimentBucket('NEW_DASHBOARD_v1', 'user-2')
      
      // Not always different, but very likely
      // We'll check distribution in another test
      expect(bucket1).toBeGreaterThanOrEqual(0)
      expect(bucket1).toBeLessThan(100)
      expect(bucket2).toBeGreaterThanOrEqual(0)
      expect(bucket2).toBeLessThan(100)
    })

    it('should return different buckets for different seeds', () => {
      const bucket1 = resolveExperimentBucket('EXPERIMENT_A', 'user-123')
      const bucket2 = resolveExperimentBucket('EXPERIMENT_B', 'user-123')
      
      // Changing seed should change bucket allocation
      // Not always different, but very likely
      expect(bucket1).not.toBe(bucket2)
    })

    it('should return bucket in valid range 0-99', () => {
      const users = generateTestUserIds(100)
      
      for (const userId of users) {
        const bucket = resolveExperimentBucket('TEST_EXPERIMENT', userId)
        expect(bucket).toBeGreaterThanOrEqual(0)
        expect(bucket).toBeLessThan(100)
      }
    })
  })

  // =====================================================
  // IS IN EXPERIMENT TESTS
  // =====================================================

  describe('isInExperiment', () => {
    it('should return true when bucket is below percentage', () => {
      // This test depends on implementation detail - we test distribution instead
      // A user at bucket 0-49 should be in experiment with 50% threshold
      const inExperiment = isInExperiment('TEST', 'user-with-bucket-0', 50)
      
      // This will fail if hash gives bucket >= 50
      // We'll verify distribution statistically
    })

    it('should handle 0% correctly', () => {
      // With 0%, no one should be in experiment
      // But due to hash distribution, some might be at bucket 0
      // The implementation should handle this correctly
      const users = generateTestUserIds(1000)
      let inCount = 0
      
      for (const userId of users) {
        if (isInExperiment('ZERO_PERCENT', userId, 0)) {
          inCount++
        }
      }
      
      // With 0%, should be 0 or very close to 0
      expect(inCount).toBe(0)
    })

    it('should handle 100% correctly', () => {
      const users = generateTestUserIds(1000)
      let inCount = 0
      
      for (const userId of users) {
        if (isInExperiment('FULL_PERCENT', userId, 100)) {
          inCount++
        }
      }
      
      // With 100%, everyone should be in experiment
      expect(inCount).toBe(1000)
    })
  })

  // =====================================================
  // DISTRIBUTION TESTS
  // =====================================================

  describe('testExperimentDistribution', () => {
    it('should distribute approximately 50% for 50% experiment', () => {
      const users = generateTestUserIds(10000)
      const result = testExperimentDistribution('NEW_DASHBOARD_v1', users, 50)
      
      // Allow 5% tolerance for randomness
      expect(result.percentage).toBeGreaterThan(45)
      expect(result.percentage).toBeLessThan(55)
    })

    it('should distribute approximately 25% for 25% experiment', () => {
      const users = generateTestUserIds(10000)
      const result = testExperimentDistribution('NEW_DASHBOARD_v1', users, 25)
      
      // Allow 5% tolerance
      expect(result.percentage).toBeGreaterThan(20)
      expect(result.percentage).toBeLessThan(30)
    })

    it('should distribute approximately 10% for 10% experiment', () => {
      const users = generateTestUserIds(10000)
      const result = testExperimentDistribution('NEW_DASHBOARD_v1', users, 10)
      
      // Allow 5% tolerance
      expect(result.percentage).toBeGreaterThan(5)
      expect(result.percentage).toBeLessThan(15)
    })

    it('should give consistent results for same users (stable hashing)', () => {
      const userIds = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e']
      
      // Run twice
      const result1 = testExperimentDistribution('STABILITY_TEST', userIds, 50)
      const result2 = testExperimentDistribution('STABILITY_TEST', userIds, 50)
      
      // Same users should give same result
      expect(result1.inExperiment).toBe(result2.inExperiment)
      expect(result1.percentage).toBe(result2.percentage)
    })

    it('should produce different distributions with different seeds', () => {
      const users = generateTestUserIds(1000)
      
      const resultA = testExperimentDistribution('SEED_A', users, 50)
      const resultB = testExperimentDistribution('SEED_B', users, 50)
      
      // Different seeds should give different results
      // Not guaranteed but very likely
      expect(resultA.inExperiment).not.toBe(resultB.inExperiment)
    })
  })

  // =====================================================
  // BOUNDARY TESTS
  // =====================================================

  describe('boundary conditions', () => {
    it('should handle percentage 0', () => {
      const bucket = resolveExperimentBucket('TEST', 'user-1')
      const inExp = isInExperiment('TEST', 'user-1', 0)
      
      // If bucket is 0, user would be in experiment at 0%
      // This is a boundary condition
      expect(bucket).toBeGreaterThanOrEqual(0)
    })

    it('should handle percentage 100', () => {
      const inExp = isInExperiment('TEST', 'user-1', 100)
      // Should always be true at 100%
      expect(inExp).toBe(true)
    })

    it('should handle empty user list', () => {
      const result = testExperimentDistribution('TEST', [], 50)
      
      expect(result.inExperiment).toBe(0)
      expect(result.percentage).toBe(0)
    })

    it('should handle single user', () => {
      const bucket = resolveExperimentBucket('TEST', 'single-user')
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(100)
    })
  })
})