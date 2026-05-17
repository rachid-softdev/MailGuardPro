// =====================================================
// SEED DATA - PLANS + FEATURES
// =====================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding entitlements...')

  // =====================================================
  // CREATE PLANS
  // =====================================================

  const plans = [
    {
      key: 'free',
      name: 'Free',
      priceMonthly: 0,
      isActive: true,
    },
    {
      key: 'starter',
      name: 'Starter',
      priceMonthly: 1900, // $19.00
      isActive: true,
    },
    {
      key: 'pro',
      name: 'Pro',
      priceMonthly: 4900, // $49.00
      isActive: true,
    },
    {
      key: 'business',
      name: 'Business',
      priceMonthly: 9900, // $99.00
      isActive: true,
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    })
    console.log(`Created/updated plan: ${plan.key}`)
  }

  // =====================================================
  // CREATE FEATURES
  // =====================================================

  const features = [
    {
      key: 'EXPORT_PDF',
      description: 'Export validations to PDF',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'BULK_VALIDATION',
      description: 'Bulk email validation (monthly quota)',
      type: 'LIMIT' as const,
      defaultConfig: null,
    },
    {
      key: 'AI_SUMMARY',
      description: 'AI-powered email analysis summary',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'API_ACCESS',
      description: 'Full API access for integrations',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'TEAM_MEMBERS',
      description: 'Number of team members',
      type: 'LIMIT' as const,
      defaultConfig: null,
    },
    {
      key: 'NEW_DASHBOARD',
      description: 'New dashboard experiment',
      type: 'EXPERIMENT' as const,
      defaultConfig: { percentage: 50, seed: 'NEW_DASHBOARD_v1' },
    },
    {
      key: 'ADVANCED_ANALYTICS',
      description: 'Advanced analytics and reporting',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'CUSTOM_DOMAINS',
      description: 'Custom domain validation',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'PRIORITY_SUPPORT',
      description: 'Priority email support',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'WEBHOOKS',
      description: 'Webhook integrations',
      type: 'BOOLEAN' as const,
      defaultConfig: null,
    },
    {
      key: 'AUDIT_LOGS',
      description: 'Audit log retention (days)',
      type: 'LIMIT' as const,
      defaultConfig: null,
    },
  ]

  for (const feature of features) {
    await prisma.feature.upsert({
      where: { key: feature.key },
      update: {
        description: feature.description,
        type: feature.type,
        defaultConfig: feature.defaultConfig as any,
      },
      create: {
        key: feature.key,
        description: feature.description,
        type: feature.type,
        defaultConfig: feature.defaultConfig as any,
      },
    })
    console.log(`Created/updated feature: ${feature.key}`)
  }

  // =====================================================
  // ASSIGN FEATURES TO PLANS
  // =====================================================

  // FREE plan - basic features only
  const freeFeatures = [
    { featureKey: 'EXPORT_PDF', enabled: false },
    { featureKey: 'BULK_VALIDATION', enabled: false, limitValue: 0 },
    { featureKey: 'AI_SUMMARY', enabled: false },
    { featureKey: 'API_ACCESS', enabled: false },
    { featureKey: 'TEAM_MEMBERS', enabled: true, limitValue: 1 },
    { featureKey: 'NEW_DASHBOARD', enabled: false, configJson: { percentage: 0, seed: 'NEW_DASHBOARD_v1' } },
    { featureKey: 'ADVANCED_ANALYTICS', enabled: false },
    { featureKey: 'CUSTOM_DOMAINS', enabled: false },
    { featureKey: 'PRIORITY_SUPPORT', enabled: false },
    { featureKey: 'WEBHOOKS', enabled: false },
    { featureKey: 'AUDIT_LOGS', enabled: true, limitValue: 7 },
  ]

  // STARTER plan
  const starterFeatures = [
    { featureKey: 'EXPORT_PDF', enabled: true },
    { featureKey: 'BULK_VALIDATION', enabled: true, limitValue: 1000 },
    { featureKey: 'AI_SUMMARY', enabled: false },
    { featureKey: 'API_ACCESS', enabled: false },
    { featureKey: 'TEAM_MEMBERS', enabled: true, limitValue: 3 },
    { featureKey: 'NEW_DASHBOARD', enabled: true, configJson: { percentage: 25, seed: 'NEW_DASHBOARD_v1' } },
    { featureKey: 'ADVANCED_ANALYTICS', enabled: false },
    { featureKey: 'CUSTOM_DOMAINS', enabled: false },
    { featureKey: 'PRIORITY_SUPPORT', enabled: false },
    { featureKey: 'WEBHOOKS', enabled: false },
    { featureKey: 'AUDIT_LOGS', enabled: true, limitValue: 30 },
  ]

  // PRO plan
  const proFeatures = [
    { featureKey: 'EXPORT_PDF', enabled: true },
    { featureKey: 'BULK_VALIDATION', enabled: true, limitValue: 10000 },
    { featureKey: 'AI_SUMMARY', enabled: true },
    { featureKey: 'API_ACCESS', enabled: true },
    { featureKey: 'TEAM_MEMBERS', enabled: true, limitValue: 10 },
    { featureKey: 'NEW_DASHBOARD', enabled: true, configJson: { percentage: 50, seed: 'NEW_DASHBOARD_v1' } },
    { featureKey: 'ADVANCED_ANALYTICS', enabled: true },
    { featureKey: 'CUSTOM_DOMAINS', enabled: false },
    { featureKey: 'PRIORITY_SUPPORT', enabled: false },
    { featureKey: 'WEBHOOKS', enabled: true },
    { featureKey: 'AUDIT_LOGS', enabled: true, limitValue: 90 },
  ]

  // BUSINESS plan - unlimited
  const businessFeatures = [
    { featureKey: 'EXPORT_PDF', enabled: true },
    { featureKey: 'BULK_VALIDATION', enabled: true, limitValue: null }, // unlimited
    { featureKey: 'AI_SUMMARY', enabled: true },
    { featureKey: 'API_ACCESS', enabled: true },
    { featureKey: 'TEAM_MEMBERS', enabled: true, limitValue: null }, // unlimited
    { featureKey: 'NEW_DASHBOARD', enabled: true, configJson: { percentage: 100, seed: 'NEW_DASHBOARD_v1' } },
    { featureKey: 'ADVANCED_ANALYTICS', enabled: true },
    { featureKey: 'CUSTOM_DOMAINS', enabled: true },
    { featureKey: 'PRIORITY_SUPPORT', enabled: true },
    { featureKey: 'WEBHOOKS', enabled: true },
    { featureKey: 'AUDIT_LOGS', enabled: true, limitValue: null }, // unlimited
  ]

  const planFeatureMap: Record<string, typeof freeFeatures> = {
    free: freeFeatures,
    starter: starterFeatures,
    pro: proFeatures,
    business: businessFeatures,
  }

  for (const [planKey, featureList] of Object.entries(planFeatureMap)) {
    const plan = await prisma.plan.findUnique({ where: { key: planKey } })
    if (!plan) continue

    for (const pf of featureList) {
      const feature = await prisma.feature.findUnique({ where: { key: pf.featureKey } })
      if (!feature) continue

      await prisma.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: plan.id,
            featureId: feature.id,
          },
        },
        update: {
          enabled: pf.enabled,
          limitValue: pf.limitValue,
          configJson: (pf as any).configJson ?? null,
        },
        create: {
          planId: plan.id,
          featureId: feature.id,
          enabled: pf.enabled,
          limitValue: pf.limitValue ?? null,
          configJson: (pf as any).configJson ?? null,
        },
      })
      console.log(`Assigned ${pf.featureKey} to ${planKey} (enabled: ${pf.enabled}, limit: ${pf.limitValue})`)
    }
  }

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })